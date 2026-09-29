import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { recordActivity } from "@/lib/admin";
import { createSession, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS, verifySignupOtp, type AccountUser } from "@/lib/auth";
import { storeDatabase } from "@/lib/store";

export const runtime = "nodejs";

const MAX_OTP_ATTEMPTS = 5;

export async function POST(request: Request) {
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return NextResponse.json({ error: "Please enter your email and verification code." }, { status: 400 });
    }

    const details = body as Record<string, unknown>;
    const email = typeof details.email === "string" ? details.email.trim().toLowerCase() : "";
    const code = typeof details.code === "string" ? details.code.trim() : "";
    if (email.length > 254 || !/^\S+@\S+\.\S+$/.test(email) || !/^\d{6}$/.test(code)) {
        return NextResponse.json({ error: "Enter a valid email and six-digit code." }, { status: 400 });
    }

    const pending = storeDatabase.prepare(`
            SELECT name, mobile_number, password_hash, otp_hash, expires_at, attempts
      FROM pending_signups WHERE email = ?
        `).get(email) as { name: string; mobile_number: string; password_hash: string; otp_hash: string; expires_at: string; attempts: number } | undefined;
    if (!pending || Date.parse(pending.expires_at) <= Date.now()) {
        if (pending) storeDatabase.prepare("DELETE FROM pending_signups WHERE email = ?").run(email);
        return NextResponse.json({ error: "That code has expired. Request a new one to continue." }, { status: 400 });
    }
    if (pending.attempts >= MAX_OTP_ATTEMPTS) {
        storeDatabase.prepare("DELETE FROM pending_signups WHERE email = ?").run(email);
        return NextResponse.json({ error: "Too many incorrect attempts. Start signup again." }, { status: 429 });
    }
    if (!verifySignupOtp(email, code, pending.otp_hash)) {
        const attempts = pending.attempts + 1;
        storeDatabase.prepare("UPDATE pending_signups SET attempts = ? WHERE email = ?").run(attempts, email);
        return NextResponse.json({ error: attempts >= MAX_OTP_ATTEMPTS ? "Too many incorrect attempts. Start signup again." : "That code is incorrect." }, { status: 400 });
    }

    if (!pending.mobile_number) {
        storeDatabase.prepare("DELETE FROM pending_signups WHERE email = ?").run(email);
        return NextResponse.json({ error: "Please restart signup and add your mobile number." }, { status: 400 });
    }

    const user: AccountUser = { id: randomUUID(), name: pending.name, email, mobileNumber: pending.mobile_number };
    try {
        storeDatabase.transaction(() => {
            storeDatabase.prepare("INSERT INTO users (id, name, email, mobile_number, password_hash) VALUES (?, ?, ?, ?, ?)")
                .run(user.id, user.name, user.email, user.mobileNumber, pending.password_hash);
            storeDatabase.prepare("DELETE FROM pending_signups WHERE email = ?").run(email);
        })();
        recordActivity("account.signup.verified", email, "Account created after email verification");
        const token = createSession(user.id);
        const response = NextResponse.json({ user }, { status: 201 });
        response.cookies.set(SESSION_COOKIE_NAME, token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge: SESSION_MAX_AGE_SECONDS,
        });
        return response;
    } catch (error) {
        if (error instanceof Error && error.message.includes("UNIQUE constraint failed: users.email")) {
            storeDatabase.prepare("DELETE FROM pending_signups WHERE email = ?").run(email);
            return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
        }
        console.error("Could not verify signup", error);
        return NextResponse.json({ error: "We could not verify your account. Please try again." }, { status: 500 });
    }
}