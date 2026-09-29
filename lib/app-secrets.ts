import "server-only";

import { createHmac, randomBytes } from "node:crypto";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { storeDatabase } from "./store";

const keyPath = join(process.cwd(), "data", ".storefront-secrets-key");

function readManagedKey(): Buffer {
    const key = readFileSync(keyPath);
    if (key.length !== 32) throw new Error("The Storefront application key is invalid.");
    chmodSync(keyPath, 0o600);
    return key;
}

export function getApplicationKey(): Buffer {
    const configuredKey = process.env.AWS_CONFIG_ENCRYPTION_KEY;
    if (configuredKey) {
        if (!/^[a-f0-9]{64}$/i.test(configuredKey)) {
            throw new Error("AWS_CONFIG_ENCRYPTION_KEY must be a 32-byte hex key.");
        }
        return Buffer.from(configuredKey, "hex");
    }

    try {
        return readManagedKey();
    } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }

    const existingAwsConfig = storeDatabase.prepare("SELECT 1 FROM aws_settings WHERE id = 1").get();
    if (existingAwsConfig) {
        throw new Error("The Storefront application key is missing. Restore data/.storefront-secrets-key before using saved AWS credentials.");
    }

    const key = randomBytes(32);
    try {
        writeFileSync(keyPath, key, { flag: "wx", mode: 0o600 });
        chmodSync(keyPath, 0o600);
        return key;
    } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "EEXIST") return readManagedKey();
        throw error;
    }
}

export function getApplicationSecret(purpose: string): string {
    return createHmac("sha256", getApplicationKey()).update(`storefront:${purpose}`).digest("hex");
}