import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { PRODUCT } from "@/config/product";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: {
    default: `${PRODUCT.name} — ${PRODUCT.tagline}`,
    template: `%s · ${PRODUCT.name}`,
  },
  description: `${PRODUCT.name} — sistem manajemen freight forwarding terpadu.`,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
