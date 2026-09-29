import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Storefront | Considered things for everyday living",
  description: "A small collection of useful, beautiful things for the home.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return <html lang="en"><body>{children}</body></html>;
}
