import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const nextConfig = {
  output: "export",
  basePath: "/storefront",
  trailingSlash: true,
  env: { NEXT_PUBLIC_STATIC_PREVIEW: "true" },
  turbopack: { root: projectRoot },
};

export default nextConfig;
