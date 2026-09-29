import type { Metadata } from "next";
import AdminPanel from "./admin-panel";

export const metadata: Metadata = {
    title: "Admin | Storefront",
    robots: { index: false, follow: false },
};

export default function AdminPage() {
    return <AdminPanel />;
}