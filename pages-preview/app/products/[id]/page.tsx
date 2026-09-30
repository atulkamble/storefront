import { generateStaticParams as getProductParams } from "../../../../app/products/[id]/page";

export { default, generateMetadata } from "../../../../app/products/[id]/page";

export const dynamicParams = false;

export async function generateStaticParams() {
  return getProductParams();
}
