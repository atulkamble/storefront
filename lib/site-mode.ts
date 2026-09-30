export const isStaticPreview = process.env.NEXT_PUBLIC_STATIC_PREVIEW === "true";

export const storefrontFooterNote = isStaticPreview
  ? "Browse the collection and save your bag. Checkout and accounts are unavailable in this preview."
  : "Small things, considered well. Checkout places a demo order and does not process a payment.";
