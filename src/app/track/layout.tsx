import type { Metadata } from "next";
import Link from "next/link";
import { Ship } from "lucide-react";
import { PRODUCT } from "@/config/product";

export const metadata: Metadata = { title: "Tracking Shipment" };

export default function TrackLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-14 max-w-4xl items-center gap-2 px-4 font-semibold text-primary">
          <Link href="/track" className="flex items-center gap-2"><Ship className="h-6 w-6" /> {PRODUCT.name} <span className="font-normal text-muted-foreground">Tracking</span></Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl p-4 sm:p-6">{children}</main>
      <footer className="mx-auto max-w-4xl px-4 py-8 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} PT Samudra Lintas Logistik · Public shipment tracking
      </footer>
    </div>
  );
}
