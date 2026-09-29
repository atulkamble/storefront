import { NextResponse } from "next/server";
import { testAwsSesConfiguration } from "@/lib/aws-config";
import { hasAdminSession, recordActivity } from "@/lib/admin";

export const runtime = "nodejs";

export async function POST() {
    if (!await hasAdminSession()) return NextResponse.json({ error: "Admin sign-in is required." }, { status: 401 });
    try {
        const result = await testAwsSesConfiguration();
        if (!result.verified) {
            return NextResponse.json({ error: `SES identity ${result.senderEmail} is not verified for sending.` }, { status: 422 });
        }
        recordActivity("admin.aws.tested", "admin", `AWS SES connection verified for ${result.senderEmail}`);
        return NextResponse.json({ ok: true, message: `SES is connected and ${result.senderEmail} is verified for sending.` });
    } catch (error) {
        const reason = error instanceof Error ? error.message : "AWS SES connection failed.";
        recordActivity("admin.aws.test_failed", "admin", "AWS SES connection test failed");
        return NextResponse.json({ error: reason }, { status: 502 });
    }
}