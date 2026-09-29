import "server-only";

import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getApplicationSecret } from "./app-secrets";
import { storeDatabase } from "./store";

export const SESSION_COOKIE_NAME = "commonplace_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export type AccountUser = {
    id: string;
    name: string;
    email: string;
    mobileNumber: string;
};

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        scrypt(password, salt, 64, (error, key) => {
            if (error) reject(error);
            else resolve(key as Buffer);
        });
    });
}

export async function hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16);
    const key = await deriveKey(password, salt);
    return `${salt.toString("hex")}:${key.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
    const [saltHex, keyHex] = storedHash.split(":");
    if (!/^[a-f0-9]{32}$/i.test(saltHex ?? "") || !/^[a-f0-9]{128}$/i.test(keyHex ?? "")) return false;
    const expected = Buffer.from(keyHex, "hex");
    const actual = await deriveKey(password, Buffer.from(saltHex, "hex"));
    return timingSafeEqual(expected, actual);
}

export function hashSignupOtp(email: string, code: string): string {
    const secret = process.env.AUTH_OTP_SECRET || getApplicationSecret("signup-otp");
    return createHmac("sha256", secret).update(`${email}:${code}`).digest("hex");
}

export function verifySignupOtp(email: string, code: string, storedHash: string): boolean {
    if (!/^[a-f0-9]{64}$/i.test(storedHash)) return false;
    const actual = Buffer.from(hashSignupOtp(email, code), "hex");
    const expected = Buffer.from(storedHash, "hex");
    return timingSafeEqual(expected, actual);
}

function hashSessionToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

export function createSession(userId: string): string {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString();
    storeDatabase.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
        .run(hashSessionToken(token), userId, expiresAt);
    return token;
}

export async function getCurrentUser(): Promise<AccountUser | null> {
    const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
    if (!token) return null;

    const now = new Date().toISOString();
    storeDatabase.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now);
    const user = storeDatabase.prepare(`
    SELECT users.id, users.name, users.email, users.mobile_number AS mobileNumber
      FROM sessions JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?
    `).get(hashSessionToken(token), now) as AccountUser | undefined;
    return user ?? null;
}

export async function removeCurrentSession(): Promise<void> {
    const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
    if (token) {
        storeDatabase.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashSessionToken(token));
    }
}