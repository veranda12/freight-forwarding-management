import { redirect } from "next/navigation";
import { Ship } from "lucide-react";
import { auth } from "@/auth";
import { PRODUCT } from "@/config/product";
import { LoginForm } from "./login-form";
import { IDLE_TIMEOUT_SEC } from "@/config/session";

/** `?reason=idle`: datang dari logout otomatis karena tidak ada aktivitas. */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const session = await auth();
  if (session?.user) redirect("/dashboard");
  const { reason } = await searchParams;

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Panel kiri (branding) */}
      <div className="relative hidden flex-col justify-between bg-primary p-10 text-primary-foreground lg:flex">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <Ship className="h-6 w-6" />
          {PRODUCT.name}
        </div>
        <div className="space-y-4">
          <h1 className="text-3xl font-bold leading-tight">
            Kelola operasional freight forwarding dalam satu sistem.
          </h1>
          <p className="max-w-md text-primary-foreground/80">
            Quotation, job, booking, dokumen B/L, costing, invoice, hingga laporan keuangan,
            terintegrasi end-to-end untuk Sea, Air, dan Trucking.
          </p>
          <ul className="grid grid-cols-2 gap-2 text-sm text-primary-foreground/90">
            {["Multi-currency & kurs harian", "Jurnal otomatis & reversal", "Tracking publik", "Profitability per job"].map((f) => (
              <li key={f} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground/70" />
                {f}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-primary-foreground/60">© {new Date().getFullYear()} {PRODUCT.name}. Demo system.</p>
      </div>

      {/* Panel kanan (form) */}
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="space-y-2 text-center lg:hidden">
            <div className="flex items-center justify-center gap-2 text-lg font-semibold text-primary">
              <Ship className="h-6 w-6" /> {PRODUCT.name}
            </div>
          </div>
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold tracking-tight">Selamat datang</h2>
            <p className="text-sm text-muted-foreground">Masuk untuk melanjutkan ke dashboard.</p>
          </div>
          {reason === "idle" && (
            <p role="status" className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
              Sesi berakhir karena tidak ada aktivitas selama {IDLE_TIMEOUT_SEC / 60} menit. Silakan masuk lagi.
            </p>
          )}
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
