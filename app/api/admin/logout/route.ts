import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, getAdminSessionToken, hasAdminSession, recordActivity, removeAdminSession } from "@/lib/admin";

export const runtime = "nodejs";

export async function POST() {
    const token = await getAdminSessionToken();
    if (token && await hasAdminSession()) {
        removeAdminSession(token);
        recordActivity("admin.logout", "admin", "Admin signed out");
    }
    const response = NextResponse.json({ ok: true });
    response.cookies.set(ADMIN_SESSION_COOKIE, "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/api/admin",
        maxAge: 0,
    });
    return response;
}