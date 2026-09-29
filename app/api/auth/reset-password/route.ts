import { NextResponse } from "next/server";
import { createSession, getCurrentUser, hashPassword, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS, verifyPassword } from "@/lib/auth";
import { storeDatabase } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) {
        return NextResponse.json({ error: "Sign in before resetting your password." }, { status: 401 });
    }

    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return NextResponse.json({ error: "Please submit valid password details." }, { status: 400 });
    }

    const details = body as Record<string, unknown>;
    const currentPassword = typeof details.currentPassword === "string" ? details.currentPassword : "";
    const newPassword = typeof details.newPassword === "string" ? details.newPassword : "";
    if (!currentPassword || currentPassword.length > 128 || newPassword.length < 8 || newPassword.length > 128) {
        return NextResponse.json({ error: "Enter your current password and a new password between 8 and 128 characters." }, { status: 400 });
    }
    if (currentPassword === newPassword) {
        return NextResponse.json({ error: "Choose a new password that is different from your current password." }, { status: 400 });
    }

    const record = storeDatabase.prepare("SELECT password_hash FROM users WHERE id = ?")
        .get(user.id) as { password_hash: string } | undefined;
    if (!record || !(await verifyPassword(currentPassword, record.password_hash))) {
        return NextResponse.json({ error: "Your current password is incorrect." }, { status: 401 });
    }

    try {
        const passwordHash = await hashPassword(newPassword);
        const resetPassword = storeDatabase.transaction(() => {
            storeDatabase.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, user.id);
            storeDatabase.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);
            return createSession(user.id);
        });
        const token = resetPassword();
        const response = NextResponse.json({ user, message: "Your password was reset." });
        response.cookies.set(SESSION_COOKIE_NAME, token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge: SESSION_MAX_AGE_SECONDS,
        });
        return response;
    } catch (error) {
        console.error("Could not reset password", error);
        return NextResponse.json({ error: "We could not reset your password. Please try again." }, { status: 500 });
    }
}