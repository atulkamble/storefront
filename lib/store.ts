import "server-only";

import Database from "better-sqlite3";
import { unstable_cache } from "next/cache";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { seedProducts } from "./products";
import type { Product } from "./types";

const dataDirectory = join(process.cwd(), "data");
mkdirSync(dataDirectory, { recursive: true });

const globalForStore = globalThis as typeof globalThis & {
  storeDatabase?: Database.Database;
};

export const storeDatabase = globalForStore.storeDatabase ?? new Database(join(dataDirectory, "commonplace.sqlite"));
globalForStore.storeDatabase = storeDatabase;
storeDatabase.pragma("busy_timeout = 10000");
storeDatabase.pragma("foreign_keys = ON");
storeDatabase.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL,
    description TEXT NOT NULL, price INTEGER NOT NULL CHECK (price >= 0),
    imageUrl TEXT NOT NULL, badge TEXT, stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0)
  );
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY, customer_name TEXT NOT NULL, customer_email TEXT NOT NULL,
    shipping_address TEXT NOT NULL, total INTEGER NOT NULL CHECK (total >= 0),
    subtotal INTEGER NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
    discount INTEGER NOT NULL DEFAULT 0 CHECK (discount >= 0), coupon_code TEXT,
    status TEXT NOT NULL DEFAULT 'placed', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT NOT NULL REFERENCES orders(id),
    product_id TEXT NOT NULL REFERENCES products(id), product_name TEXT NOT NULL,
    unit_price INTEGER NOT NULL, quantity INTEGER NOT NULL CHECK (quantity > 0)
  );
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
    mobile_number TEXT NOT NULL DEFAULT '', password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS pending_signups (
    email TEXT PRIMARY KEY, name TEXT NOT NULL, mobile_number TEXT NOT NULL DEFAULT '', password_hash TEXT NOT NULL,
    otp_hash TEXT NOT NULL, expires_at TEXT NOT NULL, sent_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS admin_sessions (
    token_hash TEXT PRIMARY KEY, expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, actor TEXT,
    summary TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS aws_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1), credentials_ciphertext TEXT NOT NULL,
    credentials_iv TEXT NOT NULL, credentials_tag TEXT NOT NULL, access_key_hint TEXT NOT NULL,
    region TEXT NOT NULL, output_format TEXT NOT NULL DEFAULT 'json', sender_email TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
  CREATE INDEX IF NOT EXISTS activity_logs_created_idx ON activity_logs(created_at);
`);

const userColumns = storeDatabase.pragma("table_info(users)") as { name: string }[];
if (!userColumns.some((column) => column.name === "mobile_number")) {
  storeDatabase.exec("ALTER TABLE users ADD COLUMN mobile_number TEXT NOT NULL DEFAULT ''");
}
const pendingSignupColumns = storeDatabase.pragma("table_info(pending_signups)") as { name: string }[];
if (!pendingSignupColumns.some((column) => column.name === "mobile_number")) {
  storeDatabase.exec("ALTER TABLE pending_signups ADD COLUMN mobile_number TEXT NOT NULL DEFAULT ''");
}

const orderColumns = storeDatabase.pragma("table_info(orders)") as { name: string }[];
if (!orderColumns.some((column) => column.name === "subtotal")) {
  storeDatabase.exec("ALTER TABLE orders ADD COLUMN subtotal INTEGER NOT NULL DEFAULT 0 CHECK (subtotal >= 0)");
}
if (!orderColumns.some((column) => column.name === "discount")) {
  storeDatabase.exec("ALTER TABLE orders ADD COLUMN discount INTEGER NOT NULL DEFAULT 0 CHECK (discount >= 0)");
}
if (!orderColumns.some((column) => column.name === "coupon_code")) {
  storeDatabase.exec("ALTER TABLE orders ADD COLUMN coupon_code TEXT");
}
storeDatabase.exec("UPDATE orders SET subtotal = total WHERE subtotal = 0 AND total > 0");

const insertProduct = storeDatabase.prepare(`
  INSERT OR IGNORE INTO products (id, name, category, description, price, imageUrl, badge, stock)
  VALUES (@id, @name, @category, @description, @price, @imageUrl, @badge, @stock)
`);
storeDatabase.transaction(() => {
  for (const product of seedProducts) insertProduct.run(product);
})();

export function getProducts(): Product[] {
  return storeDatabase.prepare("SELECT * FROM products ORDER BY rowid").all() as Product[];
}

export function getProductById(id: string): Product | null {
  const product = storeDatabase.prepare("SELECT * FROM products WHERE id = ?").get(id) as Product | undefined;
  return product ?? null;
}

export const getCachedProducts = unstable_cache(
  async () => getProducts(),
  ["commonplace-products"],
  { revalidate: 300, tags: ["products"] },
);

export const getCachedProductById = unstable_cache(
  async (id: string) => getProductById(id),
  ["commonplace-product-by-id"],
  { revalidate: 60, tags: ["products"] },
);