"use client";

import { useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/** Filter "per tanggal" (as-of) untuk Trial Balance/Neraca/Laba Rugi (D-13). */
export function AccountingFilter({ asof }: { asof: string }) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);

  function set(v: string) {
    router.push(v ? `/accounting?asof=${v}` : "/accounting");
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground"><CalendarDays className="h-4 w-4" /> Per tanggal</span>
      <Input type="date" value={asof} max={today} onChange={(e) => set(e.target.value)} className="h-9 w-[10.5rem]" />
      {asof !== today && <Button variant="ghost" size="sm" onClick={() => set(today)}>Hari ini</Button>}
    </div>
  );
}
