import { NextResponse } from "next/server";
import { hasAdminSession, recordActivity } from "@/lib/admin";
import { requestAwsSesIdentityVerification } from "@/lib/aws-config";

export const runtime = "nodejs";

export async function POST() {
    if (!await hasAdminSession()) return NextResponse.json({ error: "Admin sign-in is required." }, { status: 401 });
    try {
        const result = await requestAwsSesIdentityVerification();
        if (result.verified) {
            return NextResponse.json({ ok: true, message: `${result.senderEmail} is already verified for sending.` });
        }
        if (!result.emailSent) {
            return NextResponse.json({ ok: true, message: `SES already has ${result.senderEmail} as an identity. Check its inbox for the verification link, then test again.` });
        }
        recordActivity("admin.aws.sender_verification_requested", "admin", `SES sender verification requested for ${result.senderEmail}`);
        return NextResponse.json({ ok: true, message: `SES sent a verification email to ${result.senderEmail}. Open that message and confirm the sender, then test the identity again.` });
    } catch (error) {
        const reason = error instanceof Error ? error.message : "Could not request SES sender verification.";
        return NextResponse.json({ error: reason }, { status: 502 });
    }
}