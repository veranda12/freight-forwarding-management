"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

/** Satu kotak cari. Hasil diperbarui otomatis ±400 ms setelah berhenti mengetik, atau langsung saat Enter. */
export function ProofSearchBox({ initial }: { initial: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState(initial);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const last = useRef(initial.trim());

  const go = (value: string) => {
    const v = value.trim();
    if (v === last.current) return;
    last.current = v;
    start(() => router.replace(v ? `${pathname}?q=${encodeURIComponent(v)}` : pathname, { scroll: false }));
  };

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <form
      role="search"
      onSubmit={(e) => { e.preventDefault(); if (timer.current) clearTimeout(timer.current); go(q); }}
      className="relative"
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        autoFocus
        name="q"
        value={q}
        aria-label="Cari bukti"
        placeholder="No. bukti, invoice, bill, job, B/L, customer, vendor, keterangan, atau nominal (mis. 1.250.000,50)"
        className="h-11 pl-9 pr-9 text-base"
        onChange={(e) => {
          setQ(e.target.value);
          if (timer.current) clearTimeout(timer.current);
          const v = e.target.value;
          timer.current = setTimeout(() => go(v), 400);
        }}
      />
      {pending && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
    </form>
  );
}
