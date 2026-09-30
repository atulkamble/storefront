import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { hasAwsSesConfiguration, sendAwsPasswordResetCode } from "@/lib/aws-config";
import { recordActivity } from "@/lib/admin";
import { hashPasswordResetOtp } from "@/lib/auth";
import { storeDatabase } from "@/lib/store";

export const runtime = "nodejs";

const OTP_LIFETIME_MS = 10 * 60 * 1000;
const OTP_RESEND_DELAY_MS = 60 * 1000;
const RESET_MESSAGE = "If an account exists for that email, a reset code has been sent.";

function hasResendConfiguration(): boolean {
    return Boolean(process.env.RESEND_API_KEY && process.env.AUTH_EMAIL_FROM);
}

async function sendResetCode(email: string, code: string): Promise<void> {
    if (hasAwsSesConfiguration()) {
        await sendAwsPasswordResetCode(email, code);
        return;
    }
    if (hasResendConfiguration()) {
        const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                from: process.env.AUTH_EMAIL_FROM,
                to: [email],
                subject: "Reset your Storefront password",
                text: `Your Storefront password reset code is ${code}. It expires in 10 minutes.`,
            }),
        });
        if (!response.ok) throw new Error(`Email provider returned ${response.status}`);
        return;
    }
    if (process.env.NODE_ENV !== "development") throw new Error("Email delivery is not configured.");
    console.info(`[development] Password reset code for ${email}: ${code}`);
}

export async function POST(request: Request) {
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return NextResponse.json({ error: "Enter the email address for your account." }, { status: 400 });
    }

    const details = body as Record<string, unknown>;
    const email = typeof details.email === "string" ? details.email.trim().toLowerCase() : "";
    if (email.length > 254 || !/^\S+@\S+\.\S+$/.test(email)) {
        return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    if (!hasAwsSesConfiguration() && !hasResendConfiguration() && process.env.NODE_ENV !== "development") {
        return NextResponse.json({ error: "Password recovery email is not configured on this server." }, { status: 503 });
    }

    const user = storeDatabase.prepare("SELECT 1 FROM users WHERE email = ?").get(email);
    if (!user) return NextResponse.json({ message: RESET_MESSAGE }, { status: 202 });

    const existing = storeDatabase.prepare("SELECT sent_at FROM password_reset_requests WHERE email = ?")
        .get(email) as { sent_at: string } | undefined;
    if (existing && Date.now() - Date.parse(existing.sent_at) < OTP_RESEND_DELAY_MS) {
        return NextResponse.json({ message: RESET_MESSAGE }, { status: 202 });
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const otpHash = hashPasswordResetOtp(email, code);
    const sentAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + OTP_LIFETIME_MS).toISOString();
    storeDatabase.prepare(`
      INSERT INTO password_reset_requests (email, otp_hash, expires_at, sent_at, attempts)
      VALUES (?, ?, ?, ?, 0)
      ON CONFLICT(email) DO UPDATE SET otp_hash = excluded.otp_hash, expires_at = excluded.expires_at,
        sent_at = excluded.sent_at, attempts = 0
    `).run(email, otpHash, expiresAt, sentAt);

    try {
        await sendResetCode(email, code);
        recordActivity("account.password_reset.requested", email, "Password reset code requested");
    } catch (error) {
        console.error("Could not send password reset email", error);
        storeDatabase.prepare("DELETE FROM password_reset_requests WHERE email = ? AND otp_hash = ?").run(email, otpHash);
    }
    return NextResponse.json({ message: RESET_MESSAGE }, { status: 202 });
}