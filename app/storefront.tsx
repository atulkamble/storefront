"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowRight, Check, Heart, KeyRound, Minus, Plus, Search, ShoppingBag, Truck, X } from "lucide-react";
import Link from "next/link";
import { readStoredCart, useStoredCart, useStoredCoupon, writeStoredCart, writeStoredCoupon } from "@/lib/cart-storage";
import { calculateOfferDiscount, findOffer } from "@/lib/offers";
import type { Product } from "@/lib/types";

type Props = { products: Product[] };
type Customer = { name: string; email: string; address: string };
type SortOption = "popular" | "price-low-high" | "price-high-low";
type AuthMode = "signin" | "signup" | "reset" | "forgot" | "forgot-verify";
type AccountUser = { id: string; name: string; email: string; mobileNumber: string };
const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

export default function Storefront({ products }: Props) {
    const cart = useStoredCart();
    const couponCode = useStoredCoupon();
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
    const [dismissedCoupon, setDismissedCoupon] = useState("");
    const [couponInput, setCouponInput] = useState("");
    const [couponError, setCouponError] = useState("");
    const [account, setAccount] = useState<AccountUser | null>(null);
    const [authOpen, setAuthOpen] = useState(false);
    const [authMode, setAuthMode] = useState<AuthMode>("signin");
    const [authName, setAuthName] = useState("");
    const [authEmail, setAuthEmail] = useState("");
    const [authMobileNumber, setAuthMobileNumber] = useState("");
    const [authPassword, setAuthPassword] = useState("");
    const [authNewPassword, setAuthNewPassword] = useState("");
    const [authOtp, setAuthOtp] = useState("");
    const [resetOtp, setResetOtp] = useState("");
    const [signupPending, setSignupPending] = useState(false);
    const [signupMessage, setSignupMessage] = useState("");
    const [resetMessage, setResetMessage] = useState("");
    const [showForgotPassword, setShowForgotPassword] = useState(false);
    const [authError, setAuthError] = useState("");
    const [authSuccess, setAuthSuccess] = useState("");
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
    const activeOffer = couponCode ? findOffer(couponCode) : undefined;
    const couponEligible = !couponCode || Boolean(activeOffer && subtotal >= activeOffer.minimumSubtotal);
    const discount = activeOffer ? calculateOfferDiscount(activeOffer, subtotal) : 0;
    const estimatedTotal = subtotal - discount;
    const couponNotice = couponCode !== dismissedCoupon ? couponCode : "";

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
        setAuthSuccess("");
        setAuthPassword("");
        setAuthNewPassword("");
        setAuthOtp("");
        setResetOtp("");
        setSignupPending(false);
        setSignupMessage("");
        setResetMessage("");
        setShowForgotPassword(false);
        setAuthOpen(true);
    }

    async function submitAuth(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setAuthSubmitting(true);
        setAuthError("");
        try {
            const isReset = authMode === "reset";
            const isVerifyingSignup = authMode === "signup" && signupPending;
            const isForgotRequest = authMode === "forgot";
            const isForgotVerify = authMode === "forgot-verify";
            const endpoint = isReset
                ? "/api/auth/reset-password"
                : isVerifyingSignup
                    ? "/api/auth/verify-signup"
                    : isForgotRequest
                        ? "/api/auth/forgot-password"
                        : isForgotVerify
                            ? "/api/auth/verify-password-reset"
                            : `/api/auth/${authMode}`;
            const response = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(isReset
                    ? { currentPassword: authPassword, newPassword: authNewPassword }
                    : isVerifyingSignup
                        ? { email: authEmail, code: authOtp }
                        : isForgotRequest
                            ? { email: authEmail }
                            : isForgotVerify
                                ? { email: authEmail, code: resetOtp, newPassword: authNewPassword }
                                : { name: authName, email: authEmail, mobileNumber: authMobileNumber, password: authPassword }),
            });
            const result = await response.json() as { user?: AccountUser; error?: string; message?: string; verificationRequired?: boolean };
            if (!response.ok) throw new Error(result.error ?? "Authentication failed.");
            if (isForgotRequest) {
                setAuthMode("forgot-verify");
                setResetMessage(result.message ?? "If an account exists for that email, a reset code has been sent.");
                return;
            }
            if (isReset) {
                setAuthSuccess(result.message ?? "Your password was reset.");
                setAuthPassword("");
                setAuthNewPassword("");
                return;
            }
            if (isForgotVerify) {
                if (!result.user) throw new Error(result.error ?? "Password reset failed.");
                setAccount(result.user);
                setCustomer((current) => ({ ...current, name: result.user!.name, email: result.user!.email }));
                setAuthNewPassword("");
                setResetOtp("");
                setAuthOpen(false);
                return;
            }
            if (authMode === "signup" && !isVerifyingSignup && result.verificationRequired) {
                setSignupPending(true);
                setSignupMessage(result.message ?? `We sent a six-digit code to ${authEmail}.`);
                setAuthPassword("");
                return;
            }
            if (!result.user) throw new Error(result.error ?? "Authentication failed.");
            setAccount(result.user);
            setCustomer((current) => ({ ...current, name: result.user!.name, email: result.user!.email }));
            setAuthPassword("");
            setSignupPending(false);
            setAuthOpen(false);
        } catch (error) {
            setAuthError(error instanceof Error ? error.message : "Authentication failed.");
            if (authMode === "signin" && error instanceof Error && error.message === "Email or password is incorrect.") {
                setShowForgotPassword(true);
            }
        } finally {
            setAuthSubmitting(false);
        }
    }

    async function resendSignupCode() {
        setAuthSubmitting(true);
        setAuthError("");
        try {
            const response = await fetch("/api/auth/signup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: authEmail, resend: true }),
            });
            const result = await response.json() as { error?: string; message?: string };
            if (!response.ok) throw new Error(result.error ?? "We could not send a new code.");
            setSignupMessage(result.message ?? "A new verification code has been sent.");
        } catch (error) {
            setAuthError(error instanceof Error ? error.message : "We could not send a new code.");
        } finally {
            setAuthSubmitting(false);
        }
    }

    async function resendPasswordResetCode() {
        setAuthSubmitting(true);
        setAuthError("");
        try {
            const response = await fetch("/api/auth/forgot-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: authEmail, resend: true }),
            });
            const result = await response.json() as { error?: string; message?: string };
            if (!response.ok) throw new Error(result.error ?? "We could not send another reset code.");
            setResetMessage(result.message ?? "If an account exists for that email, a reset code has been sent.");
        } catch (error) {
            setAuthError(error instanceof Error ? error.message : "We could not send another reset code.");
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

    function applyCoupon(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const offer = findOffer(couponInput);
        if (!offer) {
            setCouponError("That offer code is not valid.");
            return;
        }
        writeStoredCoupon(offer.code);
        setCouponInput(offer.code);
        setCouponError("");
        setDismissedCoupon("");
    }

    function removeCoupon() {
        writeStoredCoupon("");
        setCouponInput("");
        setCouponError("");
        setDismissedCoupon("");
    }

    async function placeOrder(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSubmitting(true);
        setOrderError("");
        try {
            const response = await fetch("/api/orders", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ customer, couponCode: couponCode || undefined, items: cartItems.map(({ id, quantity }) => ({ productId: id, quantity })) }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error ?? "We could not place your order.");
            setOrderId(result.orderId);
            writeStoredCart({});
            writeStoredCoupon("");
            setCheckout(false);
        } catch (error) {
            setOrderError(error instanceof Error ? error.message : "We could not place your order.");
        } finally {
            setSubmitting(false);
        }
    }

    return <>
        <div className="announcement"><span>A little more considered, a little less ordinary</span><Link href="/offers">Current offers <ArrowRight size={12} /></Link></div>
        <header className="site-header">
            <a className="wordmark" href="#top" aria-label="Storefront home">store<span>front</span></a>
            <nav className="main-nav" aria-label="Main navigation">
                <a href="#shop">Shop all</a><a href="#shop" onClick={() => setCategory("Tableware")}>Table & kitchen</a><Link href="/offers">Offers</Link><a href="#story">Our point of view</a>
            </nav>
            <div className="header-actions">
                {account ? <>
                    <span className="account-greeting">Hi, {account.name.split(" ")[0]}</span>
                    <button className="icon-button auth-reset-trigger" type="button" aria-label="Reset password" title="Reset password" onClick={() => openAuth("reset")}><KeyRound size={17} /></button>
                    <button className="auth-button" type="button" onClick={signOut}>Sign out</button>
                </> : <>
                    <button className="auth-button" type="button" onClick={() => openAuth("signin")}>Sign in</button>
                    <button className="auth-button auth-signup" type="button" onClick={() => openAuth("signup")}>Sign up</button>
                </>}
                <button className="icon-button" type="button" aria-label="Search products" onClick={() => setSearchOpen(!searchOpen)}>{searchOpen ? <X size={18} /> : <Search size={18} />}</button>
                <button className="icon-button cart-trigger" type="button" aria-label={`Open bag, ${cartCount} items`} onClick={() => { setCartOpen(true); setOrderError(""); setBagNotice(null); setDismissedCoupon(couponCode); }}><ShoppingBag size={19} />{cartCount > 0 && <span className="cart-count">{cartCount}</span>}</button>
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
        <footer className="site-footer"><a className="wordmark" href="#top">store<span>front</span></a><p className="footer-note">Small things, considered well. Checkout places a demo order and does not process a payment.</p></footer>

        {authOpen && <>
            <button className="drawer-scrim auth-scrim" type="button" aria-label="Close account form" onClick={() => setAuthOpen(false)} />
            <section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
                <div className="drawer-header"><h2 id="auth-title">{authMode === "signup" ? "Create your account" : authMode === "reset" || authMode === "forgot" || authMode === "forgot-verify" ? "Reset your password" : "Welcome back"}</h2><button className="icon-button" type="button" aria-label="Close account form" onClick={() => setAuthOpen(false)}><X size={19} /></button></div>
                {authSuccess ? <div className="auth-success" role="status"><span className="order-success-icon"><Check size={22} /></span><p>{authSuccess}</p><button className="button-primary" type="button" onClick={() => setAuthOpen(false)}>Done</button></div> : <>
                    {(authMode === "signin" || authMode === "signup") && !signupPending && <div className="auth-tabs" role="tablist" aria-label="Account access">
                        <button className={authMode === "signin" ? "active" : ""} type="button" role="tab" aria-selected={authMode === "signin"} onClick={() => { setAuthMode("signin"); setAuthError(""); setSignupPending(false); setSignupMessage(""); }}>Sign in</button>
                        <button className={authMode === "signup" ? "active" : ""} type="button" role="tab" aria-selected={authMode === "signup"} onClick={() => { setAuthMode("signup"); setAuthError(""); setSignupPending(false); setSignupMessage(""); }}>Sign up</button>
                    </div>}
                    <form className="auth-form" onSubmit={submitAuth}>
                        {authMode === "signup" && !signupPending && <label>Full name<input required minLength={2} maxLength={80} autoComplete="name" value={authName} onChange={(event) => setAuthName(event.target.value)} /></label>}
                        {authMode !== "reset" && <label>Email<input required type="email" maxLength={254} autoComplete="email" disabled={signupPending || authMode === "forgot-verify"} value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} /></label>}
                        {authMode === "signup" && !signupPending && <label>Mobile number<input required type="tel" maxLength={24} autoComplete="tel" placeholder="+1 555 123 4567" value={authMobileNumber} onChange={(event) => setAuthMobileNumber(event.target.value)} /></label>}
                        {authMode === "signup" && signupPending ? <>
                            {signupMessage && <p className="auth-note" role="status">{signupMessage}</p>}
                            <label>Verification code<input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" aria-label="Six-digit verification code" value={authOtp} onChange={(event) => setAuthOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} /></label>
                        </> : authMode === "forgot-verify" ? <>
                            {resetMessage && <p className="auth-note" role="status">{resetMessage}</p>}
                            <label>Verification code<input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" aria-label="Six-digit password reset code" value={resetOtp} onChange={(event) => setResetOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} /></label>
                            <label>New password<input required type="password" minLength={8} maxLength={128} autoComplete="new-password" value={authNewPassword} onChange={(event) => setAuthNewPassword(event.target.value)} /></label>
                        </> : authMode === "forgot" ? <p className="auth-note">Enter your account email and we&apos;ll send a six-digit reset code.</p>
                            : <label>{authMode === "reset" ? "Current password" : "Password"}<input required type="password" minLength={authMode === "signup" ? 8 : 1} maxLength={128} autoComplete={authMode === "signup" ? "new-password" : "current-password"} value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} /></label>}
                        {authMode === "reset" && <label>New password<input required type="password" minLength={8} maxLength={128} autoComplete="new-password" value={authNewPassword} onChange={(event) => setAuthNewPassword(event.target.value)} /></label>}
                        {authError && <p className="checkout-error" role="alert">{authError}</p>}
                        <button className="button-primary" type="submit" disabled={authSubmitting}>{authSubmitting ? "Please wait…" : signupPending ? "Verify email" : authMode === "signup" ? "Continue" : authMode === "forgot" ? "Send reset code" : authMode === "forgot-verify" || authMode === "reset" ? "Reset password" : "Sign in"}<ArrowRight size={15} /></button>
                        {signupPending && <div className="auth-verification-actions"><button type="button" onClick={resendSignupCode} disabled={authSubmitting}>Resend code</button><button type="button" onClick={() => { setSignupPending(false); setSignupMessage(""); setAuthOtp(""); setAuthError(""); }}>Change details</button></div>}
                    </form>
                    {authMode === "signin" && <div className="auth-recovery-prompt">
                        {showForgotPassword && <p className="auth-note" role="status">You can reset your password with a code sent to your email.</p>}
                        <button className="auth-recovery-link" type="button" onClick={() => { setAuthMode("forgot"); setAuthError(""); setAuthSuccess(""); setAuthNewPassword(""); setResetOtp(""); setResetMessage(""); }}>Forgot your password?</button>
                    </div>}
                    {authMode === "forgot" && <div className="auth-verification-actions auth-recovery-actions"><button type="button" onClick={() => { setAuthMode("signin"); setAuthError(""); }}>Back to sign in</button></div>}
                    {authMode === "forgot-verify" && <div className="auth-verification-actions auth-recovery-actions"><button type="button" onClick={resendPasswordResetCode} disabled={authSubmitting}>Resend code</button><button type="button" onClick={() => { setAuthMode("forgot"); setResetOtp(""); setAuthNewPassword(""); setAuthError(""); }}>Change email</button></div>}
                </>}
            </section>
        </>}

        {(bagNotice || couponNotice) && !cartOpen && <div className="add-toast" role="status" aria-live="polite">
            <span className="toast-check"><Check size={17} /></span>
            <span className="toast-copy"><strong>{bagNotice ? bagNotice.added ? "Added to your bag" : "Quantity limit reached" : "Offer added to your bag"}</strong><span>{bagNotice ? bagNotice.name : `${couponNotice} is ready. Open your bag to see your savings.`}</span></span>
            <button className="toast-view" type="button" onClick={() => { setCartOpen(true); setBagNotice(null); setDismissedCoupon(couponCode); }}>View bag <ArrowRight size={14} /></button>
            <button className="toast-dismiss" type="button" aria-label="Dismiss notification" onClick={() => { setBagNotice(null); setDismissedCoupon(couponCode); }}><X size={16} /></button>
        </div>}

        {cartOpen && <>
            <button className="drawer-scrim" type="button" aria-label="Close bag" onClick={() => setCartOpen(false)} />
            <aside className="cart-drawer" role="dialog" aria-modal="true" aria-labelledby="cart-title">
                <div className="drawer-header"><h2 id="cart-title">Your bag <span>({cartCount})</span></h2><button className="icon-button" type="button" aria-label="Close bag" onClick={() => setCartOpen(false)}><X size={19} /></button></div>
                {orderId ? <div className="order-success"><div className="order-success-icon"><Check size={23} /></div><p className="eyebrow">Order received</p><h3>Thanks, {customer.name.split(" ")[0]}.</h3><p>Your order <strong>{orderId}</strong> is in. A confirmation will be sent to {customer.email}.</p><p>This demo records your order but does not process a payment.</p><button className="button-primary" type="button" onClick={() => { setOrderId(""); setCartOpen(false); }}>Keep looking <ArrowRight size={15} /></button></div> : <>
                    <div className="drawer-items">{cartItems.length === 0 ? <div className="drawer-empty"><ShoppingBag size={26} /><p>Your bag is taking a little breather.</p><button className="add-button" type="button" onClick={() => setCartOpen(false)}>Find something good <ArrowRight size={14} /></button></div> : cartItems.map((item) => <div className="cart-line" key={item.id}>
                        <div className="cart-line-image" role="img" aria-label={item.name} style={{ backgroundImage: `url("${item.imageUrl}")` }} /><div className="cart-line-details"><h3>{item.name}</h3><p>{money(item.price)}</p><div className="quantity-control" aria-label={`Quantity for ${item.name}`}><button type="button" aria-label={`Remove one ${item.name}`} onClick={() => changeQuantity(item.id, -1)}><Minus size={12} /></button><span>{item.quantity}</span><button type="button" aria-label={`Add one ${item.name}`} disabled={item.quantity >= 10} onClick={() => changeQuantity(item.id, 1)}><Plus size={12} /></button></div></div><span className="cart-line-total">{money(item.price * item.quantity)}</span>
                    </div>)}</div>
                    {cartItems.length > 0 && <div className="drawer-footer">
                        <form className="coupon-form" onSubmit={applyCoupon}>
                            <label htmlFor="coupon-code">Offer code</label>
                            <div className="coupon-input-row"><input id="coupon-code" maxLength={32} placeholder="Enter code" value={couponInput} onChange={(event) => setCouponInput(event.target.value)} /><button type="submit">Apply</button></div>
                            {couponError && <p className="checkout-error" role="alert">{couponError}</p>}
                        </form>
                        {couponCode && <div className={`coupon-applied${couponEligible ? "" : " coupon-pending"}`}>
                            <div><strong>{activeOffer?.code ?? couponCode}</strong><span>{activeOffer ? couponEligible ? activeOffer.title : `Add ${money(activeOffer.minimumSubtotal - subtotal)} to unlock` : "This offer is no longer available"}</span></div>
                            {discount > 0 && <strong className="coupon-savings">-{money(discount)}</strong>}
                            <button type="button" onClick={removeCoupon}>Remove</button>
                        </div>}
                        <div className="subtotal-row"><span>Subtotal</span><span>{money(subtotal)}</span></div>
                        {discount > 0 && <div className="discount-row"><span>Offer discount</span><span>-{money(discount)}</span></div>}
                        <div className="total-row"><span>Estimated total</span><strong>{money(estimatedTotal)}</strong></div>
                        <p className="shipping-note">Shipping and any applicable taxes are calculated separately.</p>
                        {checkout ? <form className="checkout-form" onSubmit={placeOrder}>
                            <label>Name<input required minLength={2} maxLength={80} autoComplete="name" value={customer.name} onChange={(event) => setCustomer({ ...customer, name: event.target.value })} /></label>
                            <label>Email<input required type="email" maxLength={254} autoComplete="email" value={customer.email} onChange={(event) => setCustomer({ ...customer, email: event.target.value })} /></label>
                            <label>Shipping address<textarea required minLength={8} maxLength={300} autoComplete="street-address" value={customer.address} onChange={(event) => setCustomer({ ...customer, address: event.target.value })} /></label>
                            {orderError && <p className="checkout-error" role="alert">{orderError}</p>}<p className="payment-note">Demo checkout only. No payment will be collected.</p><button className="button-primary" type="submit" disabled={submitting || !couponEligible}>{submitting ? "Placing order…" : "Place order"}<ArrowRight size={15} /></button>
                        </form> : <button className="button-primary" type="button" disabled={!couponEligible} onClick={() => setCheckout(true)}>Continue to checkout <ArrowRight size={15} /></button>}
                    </div>}
                </>}
            </aside>
        </>}
    </>;
}