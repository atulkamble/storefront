import { NextResponse } from "next/server";
import { recordActivity } from "@/lib/admin";
import { createSession, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS, verifyPassword, type AccountUser } from "@/lib/auth";
import { storeDatabase } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(request: Request) {
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return NextResponse.json({ error: "Please submit valid sign-in details." }, { status: 400 });
    }

    const details = body as Record<string, unknown>;
    const email = typeof details.email === "string" ? details.email.trim().toLowerCase() : "";
    const password = typeof details.password === "string" ? details.password : "";
    if (!email || email.length > 254 || password.length < 1 || password.length > 128) {
        return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
    }

    const userRecord = storeDatabase.prepare("SELECT id, name, email, mobile_number AS mobileNumber, password_hash FROM users WHERE email = ?")
        .get(email) as (AccountUser & { password_hash: string }) | undefined;
    if (!userRecord || !(await verifyPassword(password, userRecord.password_hash))) {
        return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
    }

    try {
        const user: AccountUser = { id: userRecord.id, name: userRecord.name, email: userRecord.email, mobileNumber: userRecord.mobileNumber };
        const token = createSession(user.id);
        recordActivity("account.signin", user.email, "Customer signed in");
        const response = NextResponse.json({ user });
        response.cookies.set(SESSION_COOKIE_NAME, token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge: SESSION_MAX_AGE_SECONDS,
        });
        return response;
    } catch (error) {
        console.error("Could not start session", error);
        return NextResponse.json({ error: "We could not sign you in. Please try again." }, { status: 500 });
    }
}