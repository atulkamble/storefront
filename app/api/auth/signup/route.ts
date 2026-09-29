import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createSession, hashPassword, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/lib/auth";
import { storeDatabase } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(request: Request) {
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return NextResponse.json({ error: "Please submit valid account details." }, { status: 400 });
    }

    const details = body as Record<string, unknown>;
    const name = typeof details.name === "string" ? details.name.trim() : "";
    const email = typeof details.email === "string" ? details.email.trim().toLowerCase() : "";
    const password = typeof details.password === "string" ? details.password : "";
    if (name.length < 2 || name.length > 80 || email.length > 254 || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8 || password.length > 128) {
        return NextResponse.json({ error: "Enter your name, a valid email, and a password between 8 and 128 characters." }, { status: 400 });
    }

    const user = { id: randomUUID(), name, email };
    try {
        const passwordHash = await hashPassword(password);
        storeDatabase.prepare("INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)")
            .run(user.id, user.name, user.email, passwordHash);
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
            return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
        }
        console.error("Could not create account", error);
        return NextResponse.json({ error: "We could not create your account. Please try again." }, { status: 500 });
    }
}