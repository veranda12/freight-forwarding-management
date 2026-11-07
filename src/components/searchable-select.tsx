"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Opt = { id: string; label: string };

/** Dropdown yang bisa dicari dengan mengetik, misalnya kode atau nama akun. */
export function SearchableSelect({ value, onChange, options, placeholder = "Pilih…", ariaLabel }: {
  value: string; onChange: (v: string) => void; options: Opt[]; placeholder?: string; ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options;
  }, [options, q]);
  const current = options.find((o) => o.id === value);

  return (
    <Popover modal open={open} onOpenChange={(v) => { setOpen(v); if (v) setQ(""); }}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-label={ariaLabel} aria-expanded={open} className="w-full justify-between font-normal">
          <span className={cn("truncate", !current && "text-muted-foreground")}>{current?.label ?? placeholder}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-64 p-2">
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ketik kode atau nama…" className="h-8" />
        <div className="mt-2 max-h-60 overflow-y-auto">
          {shown.length === 0 && <p className="px-2 py-3 text-sm text-muted-foreground">Tidak ditemukan.</p>}
          {shown.map((o) => (
            <button
              key={o.id} type="button"
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
              onClick={() => { onChange(o.id); setOpen(false); }}
            >
              <Check className={cn("h-3.5 w-3.5 shrink-0", o.id === value ? "opacity-100" : "opacity-0")} />
              <span className="truncate">{o.label}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
