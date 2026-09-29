import Storefront from "./storefront";
import { getCachedProducts } from "@/lib/store";

export const revalidate = 300;

export default async function Home() {
  return <Storefront products={await getCachedProducts()} />;
}
