import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, ADMIN_SESSION_MAX_AGE_SECONDS, createAdminSession, isAdminLoginConfigured, recordActivity, verifyAdminCredentials } from "@/lib/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return NextResponse.json({ error: "Enter your admin username and password." }, { status: 400 });
    }

    const details = body as Record<string, unknown>;
    const username = typeof details.username === "string" ? details.username.trim() : "";
    const password = typeof details.password === "string" ? details.password : "";
    if (!isAdminLoginConfigured()) {
        return NextResponse.json({ error: "Admin credentials are not configured on this server." }, { status: 503 });
    }
    if (username.length > 120 || password.length > 256 || !verifyAdminCredentials(username, password)) {
        recordActivity("admin.login.failed", username.slice(0, 120) || null, "Admin login failed");
        return NextResponse.json({ error: "Username or password is incorrect." }, { status: 401 });
    }

    const token = createAdminSession();
    recordActivity("admin.login", username, "Admin signed in");
    const response = NextResponse.json({ ok: true });
    response.cookies.set(ADMIN_SESSION_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/api/admin",
        maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
    });
    return response;
}