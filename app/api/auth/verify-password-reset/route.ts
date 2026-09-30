import { NextResponse } from "next/server";
import { recordActivity } from "@/lib/admin";
import { createSession, hashPassword, hashPasswordResetOtp, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS, verifyPasswordResetOtp, type AccountUser } from "@/lib/auth";
import { storeDatabase } from "@/lib/store";

export const runtime = "nodejs";

const MAX_OTP_ATTEMPTS = 5;

export async function POST(request: Request) {
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return NextResponse.json({ error: "Enter your email, reset code, and new password." }, { status: 400 });
    }

    const details = body as Record<string, unknown>;
    const email = typeof details.email === "string" ? details.email.trim().toLowerCase() : "";
    const code = typeof details.code === "string" ? details.code.trim() : "";
    const newPassword = typeof details.newPassword === "string" ? details.newPassword : "";
    if (email.length > 254 || !/^\S+@\S+\.\S+$/.test(email) || !/^\d{6}$/.test(code)
        || newPassword.length < 8 || newPassword.length > 128) {
        return NextResponse.json({ error: "Enter a valid email, six-digit code, and password between 8 and 128 characters." }, { status: 400 });
    }

    const resetRequest = storeDatabase.prepare(`
      SELECT otp_hash, expires_at, attempts FROM password_reset_requests WHERE email = ?
    `).get(email) as { otp_hash: string; expires_at: string; attempts: number } | undefined;
    if (!resetRequest || Date.parse(resetRequest.expires_at) <= Date.now()) {
        if (resetRequest) storeDatabase.prepare("DELETE FROM password_reset_requests WHERE email = ?").run(email);
        return NextResponse.json({ error: "That code is invalid or expired. Request a new reset code." }, { status: 400 });
    }
    if (resetRequest.attempts >= MAX_OTP_ATTEMPTS) {
        storeDatabase.prepare("DELETE FROM password_reset_requests WHERE email = ?").run(email);
        return NextResponse.json({ error: "Too many incorrect attempts. Request a new reset code." }, { status: 429 });
    }
    if (!verifyPasswordResetOtp(email, code, resetRequest.otp_hash)) {
        const attempts = resetRequest.attempts + 1;
        storeDatabase.prepare("UPDATE password_reset_requests SET attempts = ? WHERE email = ?").run(attempts, email);
        return NextResponse.json({ error: attempts >= MAX_OTP_ATTEMPTS ? "Too many incorrect attempts. Request a new reset code." : "That verification code is incorrect." }, { status: 400 });
    }

    const passwordHash = await hashPassword(newPassword);
    const now = new Date().toISOString();
    try {
        const resetPassword = storeDatabase.transaction(() => {
            const consumed = storeDatabase.prepare(`
              DELETE FROM password_reset_requests
              WHERE email = ? AND otp_hash = ? AND expires_at > ? AND attempts < ?
            `).run(email, hashPasswordResetOtp(email, code), now, MAX_OTP_ATTEMPTS);
            if (consumed.changes !== 1) return null;

            const user = storeDatabase.prepare(`
              SELECT id, name, email, mobile_number AS mobileNumber FROM users WHERE email = ?
            `).get(email) as AccountUser | undefined;
            if (!user) return null;

            storeDatabase.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, user.id);
            storeDatabase.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);
            return { user, token: createSession(user.id) };
        });
        const result = resetPassword();
        if (!result) return NextResponse.json({ error: "That code is invalid or expired. Request a new reset code." }, { status: 400 });

        recordActivity("account.password.reset", email, "Password reset after email verification");
        const response = NextResponse.json({ user: result.user, message: "Your password was reset." });
        response.cookies.set(SESSION_COOKIE_NAME, result.token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge: SESSION_MAX_AGE_SECONDS,
        });
        return response;
    } catch (error) {
        console.error("Could not reset password after email verification", error);
        return NextResponse.json({ error: "We could not reset your password. Request a new code and try again." }, { status: 500 });
    }
}