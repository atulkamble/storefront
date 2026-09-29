"use client";

import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { readStoredCart, writeStoredCart } from "@/lib/cart-storage";

type Props = {
    product: { id: string; name: string; stock: number };
};

export default function AddToBag({ product }: Props) {
    const [message, setMessage] = useState("");

    function addToBag() {
        const cart = readStoredCart();
        const quantity = cart[product.id] ?? 0;
        const limit = Math.min(10, product.stock);
        if (quantity >= limit) {
            setMessage(limit === 0 ? "This item is currently out of stock." : "You have reached the quantity limit for this item.");
            return;
        }
        writeStoredCart({ ...cart, [product.id]: quantity + 1 });
        setMessage(`${product.name} was added to your bag.`);
    }

    return (
        <div className="detail-actions">
            <button className="button-primary" type="button" disabled={product.stock < 1} onClick={addToBag}>
                <Plus size={15} /> Add to bag
            </button>
            {message && <p className="detail-feedback" role="status" aria-live="polite"><Check size={15} />{message}</p>}
        </div>
    );
}