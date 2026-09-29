export type Offer = {
    code: string;
    title: string;
    description: string;
    kind: "percent" | "fixed";
    value: number;
    minimumSubtotal: number;
};

export const offers: Offer[] = [
    {
        code: "WELCOME10",
        title: "A little welcome",
        description: "Take 10% off your first considered order.",
        kind: "percent",
        value: 10,
        minimumSubtotal: 5000,
    },
    {
        code: "SLOW15",
        title: "Make a little more room",
        description: "Take 15% off orders of $100 or more.",
        kind: "percent",
        value: 15,
        minimumSubtotal: 10000,
    },
    {
        code: "GATHER20",
        title: "For the long table",
        description: "Take $20 off orders of $150 or more.",
        kind: "fixed",
        value: 2000,
        minimumSubtotal: 15000,
    },
];

export function findOffer(code: string): Offer | undefined {
    const normalizedCode = code.trim().toUpperCase();
    return offers.find((offer) => offer.code === normalizedCode);
}

export function calculateOfferDiscount(offer: Offer, subtotal: number): number {
    if (subtotal < offer.minimumSubtotal) return 0;
    if (offer.kind === "fixed") return Math.min(offer.value, subtotal);
    return Math.round(subtotal * offer.value / 100);
}