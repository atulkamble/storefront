import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import ApplyOfferButton from "./apply-offer-button";
import { offers } from "@/lib/offers";

export const metadata: Metadata = {
    title: "Offers | Commonplace",
    description: "A few thoughtful offers for your next favorite thing.",
};

const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

export default function OffersPage() {
    return <>
        <div className="announcement"><span>A little more considered, a little less ordinary</span><Link href="/offers">Current offers <ArrowRight size={12} /></Link></div>
        <header className="detail-header">
            <Link className="wordmark" href="/" aria-label="Commonplace home">common<span>place</span></Link>
            <Link className="detail-header-link" href="/#shop"><ArrowLeft size={15} />Shop all</Link>
        </header>
        <main className="offers-page">
            <div className="offers-heading">
                <p className="eyebrow">A little thank you</p>
                <h1>Good things, a little less.</h1>
                <p>Use one of these offers on your next order. Choose an offer to add its code to your bag.</p>
            </div>
            <section className="offers-grid" aria-label="Current offers">
                {offers.map((offer, index) => <article className={`offer-card offer-card-${index + 1}`} key={offer.code}>
                    <div className="offer-card-head"><p className="eyebrow">Current offer · 0{index + 1}</p><span className="offer-spark">✳</span></div>
                    <p className="offer-amount">{offer.kind === "percent" ? `${offer.value}% off` : `${money(offer.value)} off`}</p>
                    <h2>{offer.title}</h2>
                    <p className="offer-description">{offer.description}</p>
                    <p className="offer-minimum">Minimum order {money(offer.minimumSubtotal)}</p>
                    <div className="offer-code-row"><span>Use code</span><code>{offer.code}</code></div>
                    <ApplyOfferButton code={offer.code} />
                </article>)}
            </section>
            <p className="offers-footnote">One offer per order. Offers apply to merchandise subtotal before shipping and taxes.</p>
            <Link className="offers-back-link" href="/#shop">Back to the collection <ArrowRight size={15} /></Link>
        </main>
        <footer className="site-footer"><Link className="wordmark" href="/">common<span>place</span></Link><p className="footer-note">Small things, considered well. Checkout places a demo order and does not process a payment.</p></footer>
    </>;
}