import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { storeDatabase } from "./store";

export const ADMIN_SESSION_COOKIE = "commonplace_admin";
export const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

function hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

function configuredCredentials(): { username: string; password: string } | null {
    const username = process.env.ADMIN_USERNAME;
    const password = process.env.ADMIN_PASSWORD;
    if (username && password) return { username, password };
    if (process.env.NODE_ENV === "development" && !username && !password) {
        return { username: "admin", password: "admin" };
    }
    return null;
}

export function isAdminLoginConfigured(): boolean {
    const credentials = configuredCredentials();
    return Boolean(credentials && !(process.env.NODE_ENV === "production" && credentials.username === "admin" && credentials.password === "admin"));
}

export function verifyAdminCredentials(username: string, password: string): boolean {
    const credentials = configuredCredentials();
    if (!credentials || !isAdminLoginConfigured()) return false;
    const matches = (provided: string, expected: string) => {
        const providedHash = createHash("sha256").update(provided).digest();
        const expectedHash = createHash("sha256").update(expected).digest();
        return timingSafeEqual(providedHash, expectedHash);
    };
    return matches(username, credentials.username) && matches(password, credentials.password);
}

export function createAdminSession(): string {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + ADMIN_SESSION_MAX_AGE_SECONDS * 1000).toISOString();
    storeDatabase.prepare("INSERT INTO admin_sessions (token_hash, expires_at) VALUES (?, ?)")
        .run(hashToken(token), expiresAt);
    return token;
}

export async function getAdminSessionToken(): Promise<string | null> {
    return (await cookies()).get(ADMIN_SESSION_COOKIE)?.value ?? null;
}

export async function hasAdminSession(): Promise<boolean> {
    const token = await getAdminSessionToken();
    if (!token) return false;
    const now = new Date().toISOString();
    storeDatabase.prepare("DELETE FROM admin_sessions WHERE expires_at <= ?").run(now);
    return Boolean(storeDatabase.prepare("SELECT 1 FROM admin_sessions WHERE token_hash = ? AND expires_at > ?")
        .get(hashToken(token), now));
}

export function removeAdminSession(token: string): void {
    storeDatabase.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").run(hashToken(token));
}

export function recordActivity(action: string, actor: string | null, summary: string): void {
    try {
        storeDatabase.prepare("INSERT INTO activity_logs (action, actor, summary) VALUES (?, ?, ?)")
            .run(action, actor, summary);
    } catch (error) {
        console.error("Could not record activity", error);
    }
}