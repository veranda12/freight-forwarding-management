import Link from "next/link";
import { Ship, Home, Search } from "lucide-react";
import { PRODUCT } from "@/config/product";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 px-4 text-center">
      <Link href="/dashboard" className="mb-8 flex items-center gap-2 text-lg font-semibold text-primary">
        <Ship className="h-6 w-6" /> {PRODUCT.name}
      </Link>
      <p className="text-6xl font-bold tracking-tight text-primary">404</p>
      <h1 className="mt-3 text-xl font-semibold">Halaman tidak ditemukan</h1>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        Alamat yang Anda tuju tidak ada atau sudah dipindahkan. Periksa kembali tautannya atau kembali ke dashboard.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Button asChild><Link href="/dashboard"><Home /> Ke Dashboard</Link></Button>
        <Button asChild variant="outline"><Link href="/jobs"><Search /> Cari Job</Link></Button>
      </div>
    </div>
  );
}
