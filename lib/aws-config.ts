import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { CreateEmailIdentityCommand, GetEmailIdentityCommand, SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { getApplicationKey } from "./app-secrets";
import { storeDatabase } from "./store";

export type AwsOutputFormat = "json" | "yaml" | "yaml-stream" | "text" | "table";

type StoredAwsSettings = {
    credentials_ciphertext: string;
    credentials_iv: string;
    credentials_tag: string;
    access_key_hint: string;
    region: string;
    output_format: AwsOutputFormat;
    sender_email: string;
    updated_at: string;
};

type AwsCredentials = { accessKeyId: string; secretAccessKey: string };

export type AwsSettingsSummary = {
    configured: boolean;
    encryptionKeyConfigured: boolean;
    accessKeyHint: string | null;
    region: string;
    outputFormat: AwsOutputFormat;
    senderEmail: string;
    updatedAt: string | null;
};

function encryptionKey(): Buffer {
    const value = process.env.AWS_CONFIG_ENCRYPTION_KEY ?? "";
    if (value && !/^[a-f0-9]{64}$/i.test(value)) throw new Error("AWS_CONFIG_ENCRYPTION_KEY must be a 32-byte hex key.");
    return getApplicationKey();
}

function encryptCredentials(credentials: AwsCredentials) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
    const ciphertext = Buffer.concat([
        cipher.update(JSON.stringify(credentials), "utf8"),
        cipher.final(),
    ]);
    return {
        credentials_ciphertext: ciphertext.toString("base64"),
        credentials_iv: iv.toString("base64"),
        credentials_tag: cipher.getAuthTag().toString("base64"),
        access_key_hint: credentials.accessKeyId.slice(-4),
    };
}

function decryptCredentials(settings: StoredAwsSettings): AwsCredentials {
    const decipher = createDecipheriv(
        "aes-256-gcm",
        encryptionKey(),
        Buffer.from(settings.credentials_iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(settings.credentials_tag, "base64"));
    const plaintext = Buffer.concat([
        decipher.update(Buffer.from(settings.credentials_ciphertext, "base64")),
        decipher.final(),
    ]).toString("utf8");
    return JSON.parse(plaintext) as AwsCredentials;
}

function readStoredSettings(): StoredAwsSettings | undefined {
    return storeDatabase.prepare("SELECT * FROM aws_settings WHERE id = 1").get() as StoredAwsSettings | undefined;
}

export function getAwsSettingsSummary(): AwsSettingsSummary {
    const settings = readStoredSettings();
    let encryptionKeyConfigured = false;
    try {
        encryptionKey();
        encryptionKeyConfigured = true;
    } catch {
        encryptionKeyConfigured = false;
    }
    return {
        configured: Boolean(settings),
        encryptionKeyConfigured,
        accessKeyHint: settings ? `••••${settings.access_key_hint}` : null,
        region: settings?.region ?? "us-east-1",
        outputFormat: settings?.output_format ?? "json",
        senderEmail: settings?.sender_email ?? "",
        updatedAt: settings?.updated_at ?? null,
    };
}

export function hasAwsSesConfiguration(): boolean {
    return Boolean(readStoredSettings());
}

export function saveAwsSettings(input: {
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
    outputFormat: AwsOutputFormat;
    senderEmail: string;
}): AwsSettingsSummary {
    const existing = readStoredSettings();
    let encrypted: Pick<StoredAwsSettings, "credentials_ciphertext" | "credentials_iv" | "credentials_tag" | "access_key_hint">;
    if (input.accessKeyId && input.secretAccessKey) {
        encrypted = encryptCredentials({ accessKeyId: input.accessKeyId, secretAccessKey: input.secretAccessKey });
    } else if (!input.accessKeyId && !input.secretAccessKey && existing) {
        encrypted = existing;
    } else {
        throw new Error("Enter both AWS access key fields, or leave both blank to keep the saved credentials.");
    }

    storeDatabase.prepare(`
      INSERT INTO aws_settings (id, credentials_ciphertext, credentials_iv, credentials_tag, access_key_hint, region, output_format, sender_email)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET credentials_ciphertext = excluded.credentials_ciphertext,
        credentials_iv = excluded.credentials_iv, credentials_tag = excluded.credentials_tag,
        access_key_hint = excluded.access_key_hint, region = excluded.region,
        output_format = excluded.output_format, sender_email = excluded.sender_email,
        updated_at = CURRENT_TIMESTAMP
    `).run(
        encrypted.credentials_ciphertext,
        encrypted.credentials_iv,
        encrypted.credentials_tag,
        encrypted.access_key_hint,
        input.region,
        input.outputFormat,
        input.senderEmail,
    );
    return getAwsSettingsSummary();
}

export function removeAwsSettings(): void {
    storeDatabase.prepare("DELETE FROM aws_settings WHERE id = 1").run();
}

function createSesClient(settings: StoredAwsSettings): SESv2Client {
    const credentials = decryptCredentials(settings);
    return new SESv2Client({
        region: settings.region,
        credentials,
        maxAttempts: 2,
    });
}

export async function testAwsSesConfiguration(): Promise<{ senderEmail: string; verified: boolean }> {
    const settings = readStoredSettings();
    if (!settings) throw new Error("Save AWS settings before testing the connection.");
    const client = createSesClient(settings);
    const identity = await client.send(new GetEmailIdentityCommand({ EmailIdentity: settings.sender_email }));
    return { senderEmail: settings.sender_email, verified: identity.VerifiedForSendingStatus === true };
}

export async function requestAwsSesIdentityVerification(): Promise<{ senderEmail: string; verified: boolean; emailSent: boolean }> {
    const settings = readStoredSettings();
    if (!settings) throw new Error("Save AWS settings before verifying the sender.");
    const client = createSesClient(settings);
    try {
        const identity = await client.send(new GetEmailIdentityCommand({ EmailIdentity: settings.sender_email }));
        return {
            senderEmail: settings.sender_email,
            verified: identity.VerifiedForSendingStatus === true,
            emailSent: false,
        };
    } catch (error) {
        const notFound = error instanceof Error && (
            error.name === "NotFoundException"
            || error.name === "ResourceNotFoundException"
            || ("$metadata" in error && typeof error.$metadata === "object" && error.$metadata !== null
                && "httpStatusCode" in error.$metadata && error.$metadata.httpStatusCode === 404)
        );
        if (!notFound) throw error;
    }

    await client.send(new CreateEmailIdentityCommand({ EmailIdentity: settings.sender_email }));
    return { senderEmail: settings.sender_email, verified: false, emailSent: true };
}

export async function sendAwsSignupCode(email: string, code: string): Promise<void> {
    const settings = readStoredSettings();
    if (!settings) throw new Error("AWS SES is not configured.");
    const client = createSesClient(settings);
    await client.send(new SendEmailCommand({
        FromEmailAddress: settings.sender_email,
        Destination: { ToAddresses: [email] },
        Content: {
            Simple: {
                Subject: { Data: "Your Storefront verification code", Charset: "UTF-8" },
                Body: { Text: { Data: `Your Storefront verification code is ${code}. It expires in 10 minutes.`, Charset: "UTF-8" } },
            },
        },
    }));
}