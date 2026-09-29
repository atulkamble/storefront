import { NextResponse } from "next/server";
import { hasAdminSession } from "@/lib/admin";
import { storeDatabase } from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
    if (!await hasAdminSession()) {
        return NextResponse.json({ error: "Admin sign-in is required." }, { status: 401 });
    }

    const metrics = storeDatabase.prepare(`
      SELECT
        (SELECT COUNT(*) FROM users) AS customerCount,
        (SELECT COUNT(*) FROM orders) AS orderCount,
        (SELECT COALESCE(SUM(total), 0) FROM orders) AS revenue,
        (SELECT COUNT(*) FROM products WHERE stock = 0) AS outOfStockCount
    `).get() as { customerCount: number; orderCount: number; revenue: number; outOfStockCount: number };
    const customers = storeDatabase.prepare(`
      SELECT id, name, email, mobile_number AS mobileNumber, created_at AS createdAt
      FROM users ORDER BY created_at DESC LIMIT 100
    `).all();
    const orders = storeDatabase.prepare(`
      SELECT id, customer_name AS customerName, customer_email AS customerEmail,
        total, status, created_at AS createdAt
      FROM orders ORDER BY created_at DESC LIMIT 100
    `).all();
    const activities = storeDatabase.prepare(`
      SELECT id, action, actor, summary, created_at AS createdAt
      FROM activity_logs ORDER BY id DESC LIMIT 100
    `).all();

    return NextResponse.json({ metrics, customers, orders, activities });
}