import { NextResponse } from "next/server";
import { recordActivity } from "@/lib/admin";
import { getCurrentUser, removeCurrentSession, SESSION_COOKIE_NAME } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
    const user = await getCurrentUser();
    await removeCurrentSession();
    if (user) recordActivity("account.signout", user.email, "Customer signed out");
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE_NAME, "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 0,
    });
    return response;
}