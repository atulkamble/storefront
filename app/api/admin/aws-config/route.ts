import { NextResponse } from "next/server";
import { getAwsSettingsSummary, removeAwsSettings, saveAwsSettings, type AwsOutputFormat } from "@/lib/aws-config";
import { hasAdminSession, recordActivity } from "@/lib/admin";

export const runtime = "nodejs";

const outputFormats = new Set<AwsOutputFormat>(["json", "yaml", "yaml-stream", "text", "table"]);

export async function GET() {
    if (!await hasAdminSession()) return NextResponse.json({ error: "Admin sign-in is required." }, { status: 401 });
    return NextResponse.json({ settings: getAwsSettingsSummary() });
}

export async function POST(request: Request) {
    if (!await hasAdminSession()) return NextResponse.json({ error: "Admin sign-in is required." }, { status: 401 });
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return NextResponse.json({ error: "Enter valid AWS settings." }, { status: 400 });
    }

    const details = body as Record<string, unknown>;
    const accessKeyId = typeof details.accessKeyId === "string" ? details.accessKeyId.trim() : "";
    const secretAccessKey = typeof details.secretAccessKey === "string" ? details.secretAccessKey : "";
    const region = typeof details.region === "string" ? details.region.trim() : "";
    const requestedOutputFormat = typeof details.outputFormat === "string" ? details.outputFormat : "";
    const senderEmail = typeof details.senderEmail === "string" ? details.senderEmail.trim() : "";
    if (region.length > 32 || !/^[a-z0-9-]{3,32}$/.test(region)) {
        return NextResponse.json({ error: "Enter a valid AWS region code, such as us-east-1." }, { status: 400 });
    }
    if (!outputFormats.has(requestedOutputFormat as AwsOutputFormat)) {
        return NextResponse.json({ error: "Choose a supported AWS CLI output format." }, { status: 400 });
    }
    const outputFormat = requestedOutputFormat as AwsOutputFormat;
    if (senderEmail.length > 254 || !/^\S+@\S+\.\S+$/.test(senderEmail)) {
        return NextResponse.json({ error: "Enter the verified SES sender email address." }, { status: 400 });
    }
    if (accessKeyId.length > 128 || (accessKeyId && !/^(AKIA|ASIA)[A-Z0-9]{16}$/.test(accessKeyId))) {
        return NextResponse.json({ error: "Enter a valid AWS access key ID." }, { status: 400 });
    }
    if (secretAccessKey.length > 256 || (secretAccessKey && secretAccessKey.length < 20)) {
        return NextResponse.json({ error: "Enter a valid AWS secret access key." }, { status: 400 });
    }

    try {
        const settings = saveAwsSettings({ accessKeyId, secretAccessKey, region, outputFormat, senderEmail });
        recordActivity("admin.aws.saved", "admin", `AWS SES settings saved for ${region}`);
        return NextResponse.json({ settings });
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save AWS settings." }, { status: 400 });
    }
}

export async function DELETE() {
    if (!await hasAdminSession()) return NextResponse.json({ error: "Admin sign-in is required." }, { status: 401 });
    removeAwsSettings();
    recordActivity("admin.aws.removed", "admin", "AWS SES settings removed");
    return NextResponse.json({ settings: getAwsSettingsSummary() });
}