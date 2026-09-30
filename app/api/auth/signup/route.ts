import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { hasAwsSesConfiguration, sendAwsSignupCode } from "@/lib/aws-config";
import { recordActivity } from "@/lib/admin";
import { hashPassword, hashSignupOtp } from "@/lib/auth";
import { storeDatabase } from "@/lib/store";

export const runtime = "nodejs";

const OTP_LIFETIME_MS = 10 * 60 * 1000;
const OTP_RESEND_DELAY_MS = 60 * 1000;

async function sendSignupCode(email: string, code: string): Promise<void> {
    const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            from: process.env.AUTH_EMAIL_FROM,
            to: [email],
            subject: "Your Storefront verification code",
            text: `Your Storefront verification code is ${code}. It expires in 10 minutes.`,
        }),
    });
    if (!response.ok) throw new Error(`Email provider returned ${response.status}`);
}

function hasResendConfiguration(): boolean {
    return Boolean(process.env.RESEND_API_KEY && process.env.AUTH_EMAIL_FROM);
}

function canDeliverSignupCode(): boolean {
    return hasAwsSesConfiguration() || hasResendConfiguration() || process.env.NODE_ENV === "development";
}

async function deliverSignupCode(email: string, code: string): Promise<void> {
    if (hasAwsSesConfiguration()) {
        await sendAwsSignupCode(email, code);
        return;
    }
    if (hasResendConfiguration()) {
        await sendSignupCode(email, code);
        return;
    }
    if (process.env.NODE_ENV !== "development") throw new Error("Email delivery is not configured.");
    console.info(`[development] Signup verification code for ${email}: ${code}`);
}

function signupCodeMessage(): string {
    if (hasAwsSesConfiguration()) return "SES accepted the verification email. Check your inbox and spam folder; SES sandbox accounts can only send to verified recipients.";
    if (hasResendConfiguration()) return "The email provider accepted the verification email. Check your inbox and spam folder.";
    return "Development code printed in the server terminal.";
}

function makeCode(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export async function POST(request: Request) {
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return NextResponse.json({ error: "Please submit valid account details." }, { status: 400 });
    }

    const details = body as Record<string, unknown>;
    const email = typeof details.email === "string" ? details.email.trim().toLowerCase() : "";
    const rawMobileNumber = typeof details.mobileNumber === "string" ? details.mobileNumber.trim() : "";
    const mobileNumber = /^\+?[\d\s().-]+$/.test(rawMobileNumber)
        ? rawMobileNumber.replace(/[\s().-]/g, "")
        : "";
    if (email.length > 254 || !/^\S+@\S+\.\S+$/.test(email)) {
        return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    if (details.resend === true) {
        if (!canDeliverSignupCode()) {
            return NextResponse.json({ error: "Email verification is not configured on this server." }, { status: 503 });
        }
        const pending = storeDatabase.prepare("SELECT sent_at FROM pending_signups WHERE email = ?")
            .get(email) as { sent_at: string } | undefined;
        if (!pending) return NextResponse.json({ error: "Start signup again to request a new code." }, { status: 404 });
        if (Date.now() - Date.parse(pending.sent_at) < OTP_RESEND_DELAY_MS) {
            return NextResponse.json({ error: "Please wait a minute before requesting another code." }, { status: 429 });
        }

        const code = makeCode();
        const otpHash = hashSignupOtp(email, code);
        const sentAt = new Date().toISOString();
        const expiresAt = new Date(Date.now() + OTP_LIFETIME_MS).toISOString();
        storeDatabase.prepare("UPDATE pending_signups SET otp_hash = ?, expires_at = ?, sent_at = ?, attempts = 0 WHERE email = ?")
            .run(otpHash, expiresAt, sentAt, email);
        try {
            await deliverSignupCode(email, code);
            recordActivity("account.signup.code_resent", email, "Signup verification code resent");
            return NextResponse.json({ verificationRequired: true, message: signupCodeMessage() });
        } catch (error) {
            console.error("Could not send signup verification email", error);
            return NextResponse.json({ error: "We could not send a new code. Please try again later." }, { status: 502 });
        }
    }

    const name = typeof details.name === "string" ? details.name.trim() : "";
    const password = typeof details.password === "string" ? details.password : "";
    if (name.length < 2 || name.length > 80 || !/^\+?\d{7,15}$/.test(mobileNumber) || password.length < 8 || password.length > 128) {
        return NextResponse.json({ error: "Enter your name, a valid mobile number, and a password between 8 and 128 characters." }, { status: 400 });
    }
    if (!canDeliverSignupCode()) {
        return NextResponse.json({ error: "Email verification is not configured on this server." }, { status: 503 });
    }
    if (storeDatabase.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) {
        return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
    }

    try {
        const passwordHash = await hashPassword(password);
        const code = makeCode();
        const otpHash = hashSignupOtp(email, code);
        const sentAt = new Date().toISOString();
        const expiresAt = new Date(Date.now() + OTP_LIFETIME_MS).toISOString();
        const existing = storeDatabase.prepare("SELECT sent_at FROM pending_signups WHERE email = ?")
            .get(email) as { sent_at: string } | undefined;
        if (existing && Date.now() - Date.parse(existing.sent_at) < OTP_RESEND_DELAY_MS) {
            return NextResponse.json({ error: "A verification code was sent recently. Please wait before trying again." }, { status: 429 });
        }
        storeDatabase.prepare(`
                    INSERT INTO pending_signups (email, name, mobile_number, password_hash, otp_hash, expires_at, sent_at, attempts)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 0)
                    ON CONFLICT(email) DO UPDATE SET name = excluded.name, mobile_number = excluded.mobile_number,
                        password_hash = excluded.password_hash,
            otp_hash = excluded.otp_hash, expires_at = excluded.expires_at, sent_at = excluded.sent_at, attempts = 0
                `).run(email, name, mobileNumber, passwordHash, otpHash, expiresAt, sentAt);
        try {
            await deliverSignupCode(email, code);
        } catch (error) {
            storeDatabase.prepare("DELETE FROM pending_signups WHERE email = ? AND otp_hash = ?").run(email, otpHash);
            throw error;
        }
        recordActivity("account.signup.started", email, "Signup verification started");
        return NextResponse.json({ verificationRequired: true, message: signupCodeMessage() }, { status: 202 });
    } catch (error) {
        console.error("Could not start account verification", error);
        return NextResponse.json({ error: "We could not send your verification code. Please try again." }, { status: 502 });
    }
}