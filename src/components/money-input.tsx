"use client";

import { Input } from "@/components/ui/input";

/** "33302542.5" menjadi "33.302.542,5". */
export function formatMoneyText(v: string): string {
  if (!v) return "";
  const [int, dec] = v.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return dec === undefined ? grouped : `${grouped},${dec}`;
}

/** "33.302.542,5" kembali menjadi "33302542.5". */
export function parseMoneyText(v: string): string {
  const clean = v.replace(/[^\d,]/g, "");
  const [int, ...dec] = clean.split(",");
  return dec.length ? `${int}.${dec.join("").slice(0, 2)}` : int;
}

/** Input nominal dengan pemisah ribuan. Nilainya tetap angka biasa dalam bentuk teks. */
export function MoneyInput({ value, onChange, ...props }: { value: string; onChange: (v: string) => void } & Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type">) {
  return <Input {...props} type="text" inputMode="decimal" value={formatMoneyText(value)} onChange={(e) => onChange(parseMoneyText(e.target.value))} />;
}
