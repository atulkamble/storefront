import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, PackageCheck } from "lucide-react";
import { notFound } from "next/navigation";
import AddToBag from "./add-to-bag";
import { getCachedProductById, getProducts } from "@/lib/catalog";
import { storefrontFooterNote } from "@/lib/site-mode";

type ProductPageProps = {
    params: Promise<{ id: string }>;
};

export const revalidate = 60;

export async function generateStaticParams() {
    return (await getProducts()).map((product) => ({ id: product.id }));
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
    const { id } = await params;
    const product = await getCachedProductById(id);
    if (!product) return { title: "Product not found | Storefront" };
    return {
        title: `${product.name} | Storefront`,
        description: product.description,
    };
}

export default async function ProductPage({ params }: ProductPageProps) {
    const { id } = await params;
    const product = await getCachedProductById(id);
    if (!product) notFound();

    return (
        <>
            <div className="announcement">A little more considered, a little less ordinary</div>
            <header className="detail-header">
                <Link className="wordmark" href="/" aria-label="Storefront home">store<span>front</span></Link>
                <Link className="detail-header-link" href="/#shop"><ArrowLeft size={15} />All pieces</Link>
            </header>
            <main className="product-detail-page">
                <nav className="detail-breadcrumb" aria-label="Breadcrumb">
                    <Link href="/#shop">Shop</Link><span>/</span><span>{product.category}</span><span>/</span><span aria-current="page">{product.name}</span>
                </nav>
                <div className="product-detail-grid">
                    <div className="detail-image" role="img" aria-label={product.name} style={{ backgroundImage: `url("${product.imageUrl}")` }} />
                    <section className="detail-content" aria-labelledby="product-title">
                        {product.badge && <p className="eyebrow detail-badge">{product.badge}</p>}
                        <p className="detail-category">{product.category}</p>
                        <h1 id="product-title">{product.name}</h1>
                        <p className="detail-price">{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(product.price / 100)}</p>
                        <p className="detail-description">{product.description}</p>
                        <AddToBag product={product} />
                        <div className="detail-promises">
                            <p><PackageCheck size={17} /> Carefully packed for its journey</p>
                            <p><Check size={17} /> Thoughtful materials, made to last</p>
                        </div>
                        <Link className="detail-continue" href="/#shop">Continue exploring <ArrowRight size={15} /></Link>
                    </section>
                </div>
            </main>
            <footer className="site-footer"><Link className="wordmark" href="/">store<span>front</span></Link><p className="footer-note">{storefrontFooterNote}</p></footer>
        </>
    );
}
