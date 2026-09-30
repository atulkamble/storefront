import Storefront from "./storefront";
import { getCachedProducts } from "@/lib/catalog";

export const revalidate = 300;

export default async function Home() {
  return <Storefront products={await getCachedProducts()} />;
}
