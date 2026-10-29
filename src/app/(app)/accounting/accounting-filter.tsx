import { CalendarDays } from "lucide-react";

/**
 * Filter "per tanggal" (as-of) untuk Trial Balance/Neraca/Laba Rugi (D-13).
 * Memakai form GET biasa (seperti Arus Kas): navigasi router di halaman yang sama
 * dengan searchParams berbeda tidak pernah di-commit, sehingga filter tampak macet.
 */
export function AccountingFilter({ asof }: { asof: string }) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <form method="get" action="/accounting" className="flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground"><CalendarDays className="h-4 w-4" /> Per tanggal</span>
      <input
        type="date" name="asof" defaultValue={asof} max={today} required
        className="h-9 w-[10.5rem] rounded-md border bg-background px-2 text-sm"
      />
      <button type="submit" className="h-9 rounded-md border px-3 text-sm hover:bg-muted">Tampilkan</button>
      {asof !== today && <a href="/accounting" className="h-9 rounded-md px-3 text-sm leading-9 hover:bg-muted">Hari ini</a>}
    </form>
  );
}
