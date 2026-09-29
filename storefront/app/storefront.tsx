"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowRight, Check, Heart, Minus, Plus, Search, ShoppingBag, Truck, X } from "lucide-react";
import Link from "next/link";
import { readStoredCart, useStoredCart, writeStoredCart } from "@/lib/cart-storage";
import type { Product } from "@/lib/types";

type Props = { products: Product[] };
type Customer = { name: string; email: string; address: string };
type SortOption = "popular" | "price-low-high" | "price-high-low";
type AuthMode = "signin" | "signup";
type AccountUser = { id: string; name: string; email: string };
const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

export default function Storefront({ products }: Props) {
    const cart = useStoredCart();
    const [favorites, setFavorites] = useState<Record<string, boolean>>({});
    const [category, setCategory] = useState("All pieces");
    const [sortOption, setSortOption] = useState<SortOption>("popular");
    const [searchOpen, setSearchOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [cartOpen, setCartOpen] = useState(false);
    const [checkout, setCheckout] = useState(false);
    const [customer, setCustomer] = useState<Customer>({ name: "", email: "", address: "" });
    const [orderId, setOrderId] = useState("");
    const [orderError, setOrderError] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [bagNotice, setBagNotice] = useState<{ name: string; added: boolean } | null>(null);
    const [account, setAccount] = useState<AccountUser | null>(null);
    const [authOpen, setAuthOpen] = useState(false);
    const [authMode, setAuthMode] = useState<AuthMode>("signin");
    const [authName, setAuthName] = useState("");
    const [authEmail, setAuthEmail] = useState("");
    const [authPassword, setAuthPassword] = useState("");
    const [authError, setAuthError] = useState("");
    const [authSubmitting, setAuthSubmitting] = useState(false);
    const categories = ["All pieces", ...new Set(products.map((product) => product.category))];
    const shownProducts = useMemo(() => products.filter((product) => {
        const matchesCategory = category === "All pieces" || product.category === category;
        const query = search.trim().toLowerCase();
        return matchesCategory && (!query || `${product.name} ${product.category} ${product.description}`.toLowerCase().includes(query));
    }).sort((left, right) => {
        if (sortOption === "price-low-high") return left.price - right.price;
        if (sortOption === "price-high-low") return right.price - left.price;
        return Number(right.badge === "Bestseller") - Number(left.badge === "Bestseller");
    }), [category, products, search, sortOption]);
    const cartItems = products.filter((product) => cart[product.id]).map((product) => ({ ...product, quantity: cart[product.id] }));
    const cartCount = cartItems.reduce((count, item) => count + item.quantity, 0);
    const subtotal = cartItems.reduce((total, item) => total + item.price * item.quantity, 0);

    useEffect(() => {
        let active = true;
        fetch("/api/auth/me")
            .then((response) => response.json())
            .then((result: { user: AccountUser | null }) => {
                const user = result.user;
                if (!active || !user) return;
                setAccount(user);
                setCustomer((current) => ({
                    ...current,
                    name: current.name || user.name,
                    email: current.email || user.email,
                }));
            })
            .catch(() => undefined);
        return () => { active = false; };
    }, []);

    function openAuth(mode: AuthMode) {
        setAuthMode(mode);
        setAuthError("");
        setAuthOpen(true);
    }

    async function submitAuth(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setAuthSubmitting(true);
        setAuthError("");
        try {
            const response = await fetch(`/api/auth/${authMode}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: authName, email: authEmail, password: authPassword }),
            });
            const result = await response.json() as { user?: AccountUser; error?: string };
            if (!response.ok || !result.user) throw new Error(result.error ?? "Authentication failed.");
            setAccount(result.user);
            setCustomer((current) => ({ ...current, name: result.user!.name, email: result.user!.email }));
            setAuthPassword("");
            setAuthOpen(false);
        } catch (error) {
            setAuthError(error instanceof Error ? error.message : "Authentication failed.");
        } finally {
            setAuthSubmitting(false);
        }
    }

    async function signOut() {
        const response = await fetch("/api/auth/signout", { method: "POST" });
        if (!response.ok) return;
        setAccount(null);
        setCustomer((current) => ({ ...current, name: "", email: "" }));
    }

    function changeQuantity(id: string, amount: number) {
        const current = readStoredCart();
        const quantity = (current[id] ?? 0) + amount;
        if (quantity <= 0) {
            delete current[id];
        } else {
            current[id] = Math.min(quantity, 10);
        }
        writeStoredCart(current);
    }

    function addToBag(product: Product) {
        if ((cart[product.id] ?? 0) >= Math.min(10, product.stock)) {
            setBagNotice({ name: product.name, added: false });
            return;
        }
        changeQuantity(product.id, 1);
        setBagNotice({ name: product.name, added: true });
    }

    async function placeOrder(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSubmitting(true);
        setOrderError("");
        try {
            const response = await fetch("/api/orders", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ customer, items: cartItems.map(({ id, quantity }) => ({ productId: id, quantity })) }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error ?? "We could not place your order.");
            setOrderId(result.orderId);
            writeStoredCart({});
            setCheckout(false);
        } catch (error) {
            setOrderError(error instanceof Error ? error.message : "We could not place your order.");
        } finally {
            setSubmitting(false);
        }
    }

    return <>
        <div className="announcement">A little more considered, a little less ordinary</div>
        <header className="site-header">
            <a className="wordmark" href="#top" aria-label="Commonplace home">common<span>place</span></a>
            <nav className="main-nav" aria-label="Main navigation">
                <a href="#shop">Shop all</a><a href="#shop" onClick={() => setCategory("Tableware")}>Table & kitchen</a><a href="#story">Our point of view</a>
            </nav>
            <div className="header-actions">
                {account ? <>
                    <span className="account-greeting">Hi, {account.name.split(" ")[0]}</span>
                    <button className="auth-button" type="button" onClick={signOut}>Sign out</button>
                </> : <>
                    <button className="auth-button" type="button" onClick={() => openAuth("signin")}>Sign in</button>
                    <button className="auth-button auth-signup" type="button" onClick={() => openAuth("signup")}>Sign up</button>
                </>}
                <button className="icon-button" type="button" aria-label="Search products" onClick={() => setSearchOpen(!searchOpen)}>{searchOpen ? <X size={18} /> : <Search size={18} />}</button>
                <button className="icon-button cart-trigger" type="button" aria-label={`Open bag, ${cartCount} items`} onClick={() => { setCartOpen(true); setOrderError(""); setBagNotice(null); }}><ShoppingBag size={19} />{cartCount > 0 && <span className="cart-count">{cartCount}</span>}</button>
            </div>
            {searchOpen && <div className="search-wrap"><input autoFocus className="search-input" aria-label="Search the collection" placeholder="Search the collection" value={search} onChange={(event) => setSearch(event.target.value)} /></div>}
        </header>

        <main id="top">
            <section className="hero" aria-labelledby="hero-title">
                <div className="hero-copy"><p className="eyebrow">The everyday edit · No. 04</p><h1 id="hero-title">Make room for the good stuff.</h1><p>Thoughtful objects for slower mornings, longer dinners, and all the in-between.</p><a className="button-primary" href="#shop">Explore the collection <ArrowRight size={15} /></a></div>
                <div className="hero-image" role="img" aria-label="Sunlit, thoughtfully furnished living room" style={{ backgroundImage: "url(https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1800&q=90)" }} />
            </section>
            <section className="benefit-strip" aria-label="Shop benefits"><div className="benefit"><Truck size={16} />Free shipping over $100</div><div className="benefit"><Check size={16} />Small makers, good materials</div><div className="benefit"><Heart size={15} />Made to be kept</div></section>

            <section className="section-wrap" id="shop" aria-labelledby="shop-title">
                <div className="section-heading"><div><p className="eyebrow">Objects with a point of view</p><h2 id="shop-title">The good things</h2></div><p>Useful, lovely, and made to find their way into your everyday.</p></div>
                <div className="catalog-controls">
                    <div className="category-row" role="group" aria-label="Filter by category">{categories.map((item) => <button key={item} className={`category-button${category === item ? " active" : ""}`} type="button" aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}</div>
                    <label className="sort-control" htmlFor="sort-products"><span>Sort by</span><select id="sort-products" value={sortOption} onChange={(event) => setSortOption(event.target.value as SortOption)}>
                        <option value="popular">Popular</option>
                        <option value="price-low-high">Price: low to high</option>
                        <option value="price-high-low">Price: high to low</option>
                    </select></label>
                </div>
                <div className="product-grid" aria-live="polite">
                    {shownProducts.map((product, index) => <article className="product-card" key={product.id} style={{ animationDelay: `${Math.min(index, 7) * 45}ms` }}>
                        <div className="product-image-wrap"><Link className="product-image-link" href={`/products/${product.id}`} aria-label={`View ${product.name}`}><div className="product-image" role="img" aria-label={product.name} style={{ backgroundImage: `url("${product.imageUrl}")` }} /></Link>{product.badge && <span className="product-badge">{product.badge}</span>}
                            <button className={`favorite-button${favorites[product.id] ? " selected" : ""}`} type="button" aria-label={favorites[product.id] ? `Remove ${product.name} from saved items` : `Save ${product.name}`} aria-pressed={Boolean(favorites[product.id])} onClick={() => setFavorites((current) => ({ ...current, [product.id]: !current[product.id] }))}><Heart size={16} fill={favorites[product.id] ? "currentColor" : "none"} /></button>
                        </div>
                        <div className="product-info"><h3><Link className="product-name-link" href={`/products/${product.id}`}>{product.name}</Link></h3><span className="product-price">{money(product.price)}</span><p className="product-category">{product.category}</p><button className="add-button" type="button" onClick={() => addToBag(product)}><Plus size={13} />Add to bag</button></div>
                    </article>)}
                    {shownProducts.length === 0 && <p className="empty-results">Nothing here just yet. Try another search.</p>}
                </div>
            </section>

            <section className="story-band" id="story"><div className="story-image" role="img" aria-label="Natural materials and handmade home objects" style={{ backgroundImage: "url(https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=1300&q=85)" }} /><div className="story-copy"><p className="eyebrow">Buy less, live with more</p><h2>Good things earn their place.</h2><p>We look for honest materials, thoughtful making, and the kind of quiet beauty that gets better with use. No grand gestures. Just the right things, for a long time.</p></div></section>
        </main>
        <footer className="site-footer"><a className="wordmark" href="#top">common<span>place</span></a><p className="footer-note">Small things, considered well. Checkout places a demo order and does not process a payment.</p></footer>

        {authOpen && <>
            <button className="drawer-scrim auth-scrim" type="button" aria-label="Close account form" onClick={() => setAuthOpen(false)} />
            <section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
                <div className="drawer-header"><h2 id="auth-title">{authMode === "signup" ? "Create your account" : "Welcome back"}</h2><button className="icon-button" type="button" aria-label="Close account form" onClick={() => setAuthOpen(false)}><X size={19} /></button></div>
                <div className="auth-tabs" role="tablist" aria-label="Account access">
                    <button className={authMode === "signin" ? "active" : ""} type="button" role="tab" aria-selected={authMode === "signin"} onClick={() => { setAuthMode("signin"); setAuthError(""); }}>Sign in</button>
                    <button className={authMode === "signup" ? "active" : ""} type="button" role="tab" aria-selected={authMode === "signup"} onClick={() => { setAuthMode("signup"); setAuthError(""); }}>Sign up</button>
                </div>
                <form className="auth-form" onSubmit={submitAuth}>
                    {authMode === "signup" && <label>Full name<input required minLength={2} maxLength={80} autoComplete="name" value={authName} onChange={(event) => setAuthName(event.target.value)} /></label>}
                    <label>Email<input required type="email" maxLength={254} autoComplete="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} /></label>
                    <label>Password<input required type="password" minLength={authMode === "signup" ? 8 : 1} maxLength={128} autoComplete={authMode === "signup" ? "new-password" : "current-password"} value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} /></label>
                    {authError && <p className="checkout-error" role="alert">{authError}</p>}
                    <button className="button-primary" type="submit" disabled={authSubmitting}>{authSubmitting ? "Please wait…" : authMode === "signup" ? "Create account" : "Sign in"}<ArrowRight size={15} /></button>
                </form>
            </section>
        </>}

        {bagNotice && !cartOpen && <div className="add-toast" role="status" aria-live="polite">
            <span className="toast-check"><Check size={17} /></span>
            <span className="toast-copy"><strong>{bagNotice.added ? "Added to your bag" : "Quantity limit reached"}</strong><span>{bagNotice.name}</span></span>
            <button className="toast-view" type="button" onClick={() => { setCartOpen(true); setBagNotice(null); }}>View bag <ArrowRight size={14} /></button>
            <button className="toast-dismiss" type="button" aria-label="Dismiss notification" onClick={() => setBagNotice(null)}><X size={16} /></button>
        </div>}

        {cartOpen && <>
            <button className="drawer-scrim" type="button" aria-label="Close bag" onClick={() => setCartOpen(false)} />
            <aside className="cart-drawer" role="dialog" aria-modal="true" aria-labelledby="cart-title">
                <div className="drawer-header"><h2 id="cart-title">Your bag <span>({cartCount})</span></h2><button className="icon-button" type="button" aria-label="Close bag" onClick={() => setCartOpen(false)}><X size={19} /></button></div>
                {orderId ? <div className="order-success"><div className="order-success-icon"><Check size={23} /></div><p className="eyebrow">Order received</p><h3>Thanks, {customer.name.split(" ")[0]}.</h3><p>Your order <strong>{orderId}</strong> is in. A confirmation will be sent to {customer.email}.</p><p>This demo records your order but does not process a payment.</p><button className="button-primary" type="button" onClick={() => { setOrderId(""); setCartOpen(false); }}>Keep looking <ArrowRight size={15} /></button></div> : <>
                    <div className="drawer-items">{cartItems.length === 0 ? <div className="drawer-empty"><ShoppingBag size={26} /><p>Your bag is taking a little breather.</p><button className="add-button" type="button" onClick={() => setCartOpen(false)}>Find something good <ArrowRight size={14} /></button></div> : cartItems.map((item) => <div className="cart-line" key={item.id}>
                        <div className="cart-line-image" role="img" aria-label={item.name} style={{ backgroundImage: `url("${item.imageUrl}")` }} /><div className="cart-line-details"><h3>{item.name}</h3><p>{money(item.price)}</p><div className="quantity-control" aria-label={`Quantity for ${item.name}`}><button type="button" aria-label={`Remove one ${item.name}`} onClick={() => changeQuantity(item.id, -1)}><Minus size={12} /></button><span>{item.quantity}</span><button type="button" aria-label={`Add one ${item.name}`} disabled={item.quantity >= 10} onClick={() => changeQuantity(item.id, 1)}><Plus size={12} /></button></div></div><span className="cart-line-total">{money(item.price * item.quantity)}</span>
                    </div>)}</div>
                    {cartItems.length > 0 && <div className="drawer-footer"><div className="subtotal-row"><span>Subtotal</span><span>{money(subtotal)}</span></div><p className="shipping-note">Shipping and any applicable taxes are calculated separately.</p>
                        {checkout ? <form className="checkout-form" onSubmit={placeOrder}>
                            <label>Name<input required minLength={2} maxLength={80} autoComplete="name" value={customer.name} onChange={(event) => setCustomer({ ...customer, name: event.target.value })} /></label>
                            <label>Email<input required type="email" maxLength={254} autoComplete="email" value={customer.email} onChange={(event) => setCustomer({ ...customer, email: event.target.value })} /></label>
                            <label>Shipping address<textarea required minLength={8} maxLength={300} autoComplete="street-address" value={customer.address} onChange={(event) => setCustomer({ ...customer, address: event.target.value })} /></label>
                            {orderError && <p className="checkout-error" role="alert">{orderError}</p>}<p className="payment-note">Demo checkout only. No payment will be collected.</p><button className="button-primary" type="submit" disabled={submitting}>{submitting ? "Placing order…" : "Place order"}<ArrowRight size={15} /></button>
                        </form> : <button className="button-primary" type="button" onClick={() => setCheckout(true)}>Continue to checkout <ArrowRight size={15} /></button>}
                    </div>}
                </>}
            </aside>
        </>}
    </>;
}