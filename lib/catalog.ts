import "server-only";

import { seedProducts } from "./products";
import { isStaticPreview } from "./site-mode";

// Pages uses the public seed catalog and never opens the application's database.
export async function getProducts() {
  if (isStaticPreview) return seedProducts;
  return (await import("./store")).getProducts();
}

export async function getCachedProducts() {
  if (isStaticPreview) return seedProducts;
  return (await import("./store")).getCachedProducts();
}

export async function getCachedProductById(id: string) {
  if (isStaticPreview) return seedProducts.find((product) => product.id === id) ?? null;
  return (await import("./store")).getCachedProductById(id);
}
