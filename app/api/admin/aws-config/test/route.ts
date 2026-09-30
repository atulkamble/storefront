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
        if (result.sendingEnabled === false) {
            return NextResponse.json({ error: "SES sending is disabled for this AWS account. Check the SES account status in AWS." }, { status: 422 });
        }
        recordActivity("admin.aws.tested", "admin", `AWS SES connection verified for ${result.senderEmail}`);
        if (result.productionAccessEnabled === false) {
            return NextResponse.json({
                ok: true,
                sandboxMode: true,
                message: `Sender is verified, but SES is still in sandbox mode. Signup emails can only go to SES-verified recipients. Request SES production access to email other addresses.`,
            });
        }
        return NextResponse.json({ ok: true, sandboxMode: false, message: `SES is connected and ${result.senderEmail} is verified for sending.` });
    } catch (error) {
        if (error instanceof Error && (error.name === "NotFoundException" || error.name === "ResourceNotFoundException")) {
            return NextResponse.json({ error: "The sender identity is not registered in this SES region. Use Send verification email to register it." }, { status: 404 });
        }
        const reason = error instanceof Error ? error.message : "AWS SES connection failed.";
        recordActivity("admin.aws.test_failed", "admin", "AWS SES connection test failed");
        return NextResponse.json({ error: reason }, { status: 502 });
    }
}