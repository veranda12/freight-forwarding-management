import type { Metadata } from "next";
import Link from "next/link";
import { Ship } from "lucide-react";
import { PRODUCT } from "@/config/product";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Tracking Shipment" };
// Nama perusahaan diambil dari Setting Perusahaan, jadi tidak dirender statis saat build.
export const dynamic = "force-dynamic";

export default async function TrackLayout({ children }: { children: React.ReactNode }) {
  const company = await prisma.companySetting.findFirst({ select: { name: true } });
  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-14 max-w-4xl items-center gap-2 px-4 font-semibold text-primary">
          <Link href="/track" className="flex items-center gap-2"><Ship className="h-6 w-6" /> {PRODUCT.name} <span className="font-normal text-muted-foreground">Tracking</span></Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl p-4 sm:p-6">{children}</main>
      <footer className="mx-auto max-w-4xl px-4 py-8 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} {company?.name ?? PRODUCT.name} · Public shipment tracking
      </footer>
    </div>
  );
}
