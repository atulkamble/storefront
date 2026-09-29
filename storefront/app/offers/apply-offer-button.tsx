"use client";

import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { writeStoredCoupon } from "@/lib/cart-storage";

export default function ApplyOfferButton({ code }: { code: string }) {
    const router = useRouter();

    function applyOffer() {
        writeStoredCoupon(code);
        router.push("/#shop");
    }

    return <button className="button-primary offer-apply" type="button" onClick={applyOffer}>Apply to bag <ArrowRight size={15} /></button>;
}