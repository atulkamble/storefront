"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Activity, ArrowUpRight, Boxes, Clock3, LogOut, PackageCheck, Settings, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import AwsSettingsPanel from "./aws-settings";

type Metrics = { customerCount: number; orderCount: number; revenue: number; outOfStockCount: number };
type Customer = { id: string; name: string; email: string; mobileNumber: string; createdAt: string };
type Order = { id: string; customerName: string; customerEmail: string; total: number; status: string; createdAt: string };
type ActivityItem = { id: number; action: string; actor: string | null; summary: string; createdAt: string };
type Overview = { metrics: Metrics; customers: Customer[]; orders: Order[]; activities: ActivityItem[] };
type View = "overview" | "activity" | "customers" | "orders" | "aws";

const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const dateTime = (date: string) => new Date(date.includes("T") ? date : `${date.replace(" ", "T")}Z`).toLocaleString();

export default function AdminPanel() {
    const [overview, setOverview] = useState<Overview | null>(null);
    const [view, setView] = useState<View>("overview");
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");

    async function loadOverview() {
        setLoading(true);
        try {
            const response = await fetch("/api/admin/overview", { cache: "no-store" });
            if (!response.ok) {
                setOverview(null);
                return;
            }
            setOverview(await response.json() as Overview);
        } catch {
            setError("Could not load admin data. Please try again.");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        let active = true;
        fetch("/api/admin/overview", { cache: "no-store" })
            .then(async (response) => {
                if (!response.ok) return null;
                return await response.json() as Overview;
            })
            .then((result) => { if (active && result) setOverview(result); })
            .catch(() => undefined)
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, []);

    async function signIn(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSubmitting(true);
        setError("");
        try {
            const response = await fetch("/api/admin/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password }),
            });
            const result = await response.json() as { error?: string };
            if (!response.ok) throw new Error(result.error ?? "Admin sign-in failed.");
            setPassword("");
            await loadOverview();
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Admin sign-in failed.");
        } finally {
            setSubmitting(false);
        }
    }

    async function signOut() {
        await fetch("/api/admin/logout", { method: "POST" });
        setOverview(null);
        setView("overview");
    }

    if (loading && !overview) {
        return <main className="admin-loading" aria-live="polite">Opening admin…</main>;
    }

    if (!overview) {
        return <main className="admin-login-shell">
            <section className="admin-login-panel" aria-labelledby="admin-login-title">
                <Link className="wordmark admin-wordmark" href="/">store<span>front</span></Link>
                <p className="admin-kicker"><ShieldCheck size={14} /> STORE ADMINISTRATION</p>
                <h1 id="admin-login-title">Sign in to your store.</h1>
                <p className="admin-login-copy">Access customer, order, inventory, and activity records.</p>
                <form className="admin-login-form" onSubmit={signIn}>
                    <label>Username<input required autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} /></label>
                    <label>Password<input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
                    {error && <p className="admin-error" role="alert">{error}</p>}
                    <button type="submit" disabled={submitting}>{submitting ? "Signing in…" : "Sign in"}<ArrowUpRight size={16} /></button>
                </form>
                <Link className="admin-return-link" href="/">Return to storefront</Link>
            </section>
            <div className="admin-login-aside" aria-hidden="true"><span>STOREFRONT / OPERATIONS</span><strong>Good things,<br />well considered.</strong><span>PRIVATE ADMIN AREA</span></div>
        </main>;
    }

    const navigation: { id: View; label: string; icon: typeof Activity }[] = [
        { id: "overview", label: "Overview", icon: Boxes },
        { id: "activity", label: "Activity", icon: Activity },
        { id: "customers", label: "Customers", icon: Users },
        { id: "orders", label: "Orders", icon: PackageCheck },
        { id: "aws", label: "AWS setup", icon: Settings },
    ];

    return <main className="admin-shell">
        <aside className="admin-sidebar">
            <Link className="wordmark admin-wordmark" href="/">store<span>front</span></Link>
            <p className="admin-side-label">STORE MANAGEMENT</p>
            <nav className="admin-nav" aria-label="Admin sections">
                {navigation.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? "active" : ""} type="button" aria-current={view === id ? "page" : undefined} onClick={() => setView(id)}><Icon size={17} />{label}{id === "activity" && <span className="admin-nav-count">{overview.activities.length}</span>}</button>)}
            </nav>
            <div className="admin-sidebar-bottom"><span className="admin-status-dot" />Store operational<button type="button" onClick={signOut}><LogOut size={16} />Sign out</button></div>
        </aside>

        <section className="admin-main">
            <header className="admin-topbar"><div><p className="admin-kicker">STOREFRONT <span>/</span> ADMIN</p><h1>{navigation.find((item) => item.id === view)?.label}</h1></div><div className="admin-topbar-meta"><span><span className="admin-status-dot" />Live store data</span><button type="button" onClick={loadOverview} disabled={loading}>Refresh</button></div></header>
            {error && <p className="admin-error admin-page-error" role="alert">{error}</p>}
            {view === "overview" && <>
                <div className="admin-metrics">
                    <article><span><Users size={17} /> CUSTOMERS</span><strong>{overview.metrics.customerCount}</strong><small>Registered accounts</small></article>
                    <article><span><PackageCheck size={17} /> ORDERS</span><strong>{overview.metrics.orderCount}</strong><small>Orders recorded</small></article>
                    <article><span><ArrowUpRight size={17} /> GROSS SALES</span><strong>{money(overview.metrics.revenue)}</strong><small>Before shipping and taxes</small></article>
                    <article><span><Boxes size={17} /> OUT OF STOCK</span><strong>{overview.metrics.outOfStockCount}</strong><small>Products needing attention</small></article>
                </div>
                <ActivityTable activities={overview.activities.slice(0, 8)} />
            </>}
            {view === "activity" && <ActivityTable activities={overview.activities} />}
            {view === "customers" && <CustomersTable customers={overview.customers} />}
            {view === "orders" && <OrdersTable orders={overview.orders} />}
            {view === "aws" && <AwsSettingsPanel />}
        </section>
    </main>;
}

function ActivityTable({ activities }: { activities: ActivityItem[] }) {
    return <section className="admin-data-section" aria-labelledby="activity-heading">
        <div className="admin-section-heading"><div><p className="admin-kicker"><Clock3 size={13} /> AUDIT TRAIL</p><h2 id="activity-heading">Recent activity</h2></div><span>{activities.length} events</span></div>
        {activities.length === 0 ? <p className="admin-empty">No activity recorded yet.</p> : <div className="admin-activity-list">{activities.map((item) => <article className="admin-activity-row" key={item.id}><span className="admin-activity-marker"><Activity size={15} /></span><div><strong>{item.summary}</strong><small>{item.action.replaceAll(".", " ")}{item.actor ? ` · ${item.actor}` : ""}</small></div><time dateTime={item.createdAt}>{dateTime(item.createdAt)}</time></article>)}</div>}
    </section>;
}

function CustomersTable({ customers }: { customers: Customer[] }) {
    return <section className="admin-data-section"><div className="admin-section-heading"><div><p className="admin-kicker"><Users size={13} /> CUSTOMER RECORDS</p><h2>Customers</h2></div><span>{customers.length} shown</span></div>{customers.length === 0 ? <p className="admin-empty">No customer accounts yet.</p> : <div className="admin-table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Mobile</th><th>Joined</th></tr></thead><tbody>{customers.map((customer) => <tr key={customer.id}><td>{customer.name}</td><td>{customer.email}</td><td>{customer.mobileNumber || "—"}</td><td>{dateTime(customer.createdAt)}</td></tr>)}</tbody></table></div>}</section>;
}

function OrdersTable({ orders }: { orders: Order[] }) {
    return <section className="admin-data-section"><div className="admin-section-heading"><div><p className="admin-kicker"><PackageCheck size={13} /> FULFILLMENT</p><h2>Orders</h2></div><span>{orders.length} shown</span></div>{orders.length === 0 ? <p className="admin-empty">No orders have been placed yet.</p> : <div className="admin-table-wrap"><table><thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Status</th><th>Placed</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td>{order.id}</td><td>{order.customerName}<small className="admin-cell-subtitle">{order.customerEmail}</small></td><td>{money(order.total)}</td><td><span className="admin-order-status">{order.status}</span></td><td>{dateTime(order.createdAt)}</td></tr>)}</tbody></table></div>}</section>;
}