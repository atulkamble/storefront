import { randomUUID } from "node:crypto";
import { revalidateTag } from "next/cache";
import { recordActivity } from "@/lib/admin";
import { storeDatabase } from "@/lib/store";
import { calculateOfferDiscount, findOffer } from "@/lib/offers";
import type { CartItem } from "@/lib/types";

export const runtime = "nodejs";

type OrderRequest = {
    customer?: { name?: unknown; email?: unknown; address?: unknown };
    items?: unknown;
    couponCode?: unknown;
};

class OrderError extends Error {
    constructor(message: string, readonly status: number) {
        super(message);
    }
}

export async function POST(request: Request) {
    let body: OrderRequest;
    try {
        body = (await request.json()) as OrderRequest;
    } catch {
        return Response.json({ error: "Please submit a valid order." }, { status: 400 });
    }

    const customer = body.customer;
    const name = typeof customer?.name === "string" ? customer.name.trim() : "";
    const email = typeof customer?.email === "string" ? customer.email.trim() : "";
    const address = typeof customer?.address === "string" ? customer.address.trim() : "";
    if (name.length < 2 || name.length > 80 || !/^\S+@\S+\.\S+$/.test(email) || email.length > 254 || address.length < 8 || address.length > 300) {
        return Response.json({ error: "Enter a name, valid email, and complete shipping address." }, { status: 400 });
    }
    if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 30) {
        return Response.json({ error: "Your cart is empty or contains too many different items." }, { status: 400 });
    }

    const quantities = new Map<string, number>();
    for (const item of body.items as CartItem[]) {
        if (!item || typeof item.productId !== "string" || !Number.isInteger(item.quantity) || item.quantity < 1) {
            return Response.json({ error: "One or more cart quantities are invalid." }, { status: 400 });
        }
        quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
    }
    if ([...quantities.values()].some((quantity) => quantity > 10)) {
        return Response.json({ error: "The limit is 10 of each item per order." }, { status: 400 });
    }
    if (body.couponCode !== undefined && body.couponCode !== null && typeof body.couponCode !== "string") {
        return Response.json({ error: "The offer code is invalid." }, { status: 400 });
    }
    const couponCode = typeof body.couponCode === "string" ? body.couponCode.trim().toUpperCase() : "";

    const orderId = `CP-${randomUUID().slice(0, 8).toUpperCase()}`;
    try {
        const createOrder = storeDatabase.transaction(() => {
            const lines = [...quantities].map(([productId, quantity]) => {
                const product = storeDatabase.prepare("SELECT id, name, price, stock FROM products WHERE id = ?").get(productId) as
                    | { id: string; name: string; price: number; stock: number }
                    | undefined;
                if (!product) throw new OrderError("An item in your cart is no longer available.", 404);
                if (product.stock < quantity) throw new OrderError(`${product.name} does not have enough stock for this quantity.`, 409);
                return { ...product, quantity };
            });
            const subtotal = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
            const offer = couponCode ? findOffer(couponCode) : undefined;
            if (couponCode && !offer) throw new OrderError("That offer code is not valid.", 400);
            if (offer && subtotal < offer.minimumSubtotal) {
                const amountRemaining = offer.minimumSubtotal - subtotal;
                throw new OrderError(`Add ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amountRemaining / 100)} more to use ${offer.code}.`, 400);
            }
            const discount = offer ? calculateOfferDiscount(offer, subtotal) : 0;
            const total = subtotal - discount;
            storeDatabase.prepare(`
                            INSERT INTO orders (id, customer_name, customer_email, shipping_address, subtotal, discount, coupon_code, total)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        `).run(orderId, name, email, address, subtotal, discount, offer?.code ?? null, total);
            const insertItem = storeDatabase.prepare(`INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity) VALUES (?, ?, ?, ?, ?)`);
            const reduceStock = storeDatabase.prepare("UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?");
            for (const line of lines) {
                insertItem.run(orderId, line.id, line.name, line.price, line.quantity);
                if (reduceStock.run(line.quantity, line.id, line.quantity).changes !== 1) {
                    throw new OrderError(`${line.name} just sold out. Please refresh your cart.`, 409);
                }
            }
            return { subtotal, discount, couponCode: offer?.code ?? null, total, itemCount: lines.reduce((sum, line) => sum + line.quantity, 0) };
        });
        const order = createOrder();
        recordActivity("order.placed", email, `Order ${orderId} placed for ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(order.total / 100)}`);
        revalidateTag("products", "max");
        return Response.json({ orderId, ...order }, { status: 201 });
    } catch (error) {
        if (error instanceof OrderError) return Response.json({ error: error.message }, { status: error.status });
        console.error("Could not create order", error);
        return Response.json({ error: "We could not place your order. Please try again." }, { status: 500 });
    }
}