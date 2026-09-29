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
    status TEXT NOT NULL DEFAULT 'placed', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT NOT NULL REFERENCES orders(id),
    product_id TEXT NOT NULL REFERENCES products(id), product_name TEXT NOT NULL,
    unit_price INTEGER NOT NULL, quantity INTEGER NOT NULL CHECK (quantity > 0)
  );
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
`);

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