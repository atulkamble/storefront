"use client";

import { useMemo, useSyncExternalStore } from "react";

export const CART_STORAGE_KEY = "commonplace-cart";
export const COUPON_STORAGE_KEY = "commonplace-coupon";
const CART_CHANGE_EVENT = "commonplace-cart-change";

function subscribe(listener: () => void) {
    window.addEventListener("storage", listener);
    window.addEventListener(CART_CHANGE_EVENT, listener);
    return () => {
        window.removeEventListener("storage", listener);
        window.removeEventListener(CART_CHANGE_EVENT, listener);
    };
}

function getSnapshot(): string {
    return window.localStorage.getItem(CART_STORAGE_KEY) ?? "{}";
}

function parseCart(serialized: string): Record<string, number> {
    try {
        const value: unknown = JSON.parse(serialized);
        if (!value || typeof value !== "object" || Array.isArray(value)) return {};
        return Object.fromEntries(
            Object.entries(value).filter((entry): entry is [string, number] =>
                typeof entry[1] === "number" && Number.isInteger(entry[1]) && entry[1] > 0 && entry[1] <= 10,
            ),
        );
    } catch {
        return {};
    }
}

export function useStoredCart(): Record<string, number> {
    const serialized = useSyncExternalStore(subscribe, getSnapshot, () => "{}");
    return useMemo(() => parseCart(serialized), [serialized]);
}

function getCouponSnapshot(): string {
    return window.localStorage.getItem(COUPON_STORAGE_KEY) ?? "";
}

export function useStoredCoupon(): string {
    return useSyncExternalStore(subscribe, getCouponSnapshot, () => "");
}

export function readStoredCart(): Record<string, number> {
    try {
        return parseCart(getSnapshot());
    } catch {
        return {};
    }
}

export function writeStoredCart(cart: Record<string, number>): void {
    try {
        window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
        window.dispatchEvent(new Event(CART_CHANGE_EVENT));
    } catch {
        // Keep shopping usable when browser storage is unavailable.
    }
}

export function writeStoredCoupon(code: string): void {
    try {
        if (code) window.localStorage.setItem(COUPON_STORAGE_KEY, code.trim().toUpperCase());
        else window.localStorage.removeItem(COUPON_STORAGE_KEY);
        window.dispatchEvent(new Event(CART_CHANGE_EVENT));
    } catch {
        // Keep shopping usable when browser storage is unavailable.
    }
}