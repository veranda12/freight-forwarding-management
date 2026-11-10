"use client";

import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Saring rate card: semua baris (`all`), tarif standar saja (`std`), atau tarif khusus satu customer (id). */
export function CustomerFilter({ value, customers }: { value: string; customers: { id: string; label: string }[] }) {
  const router = useRouter();
  return (
    <Select value={value} onValueChange={(v) => router.push(v === "all" ? "/rate-card" : `/rate-card?customer=${v}`)}>
      <SelectTrigger aria-label="Saring customer" className="w-full sm:w-72"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Semua tarif</SelectItem>
        <SelectItem value="std">Tarif standar saja</SelectItem>
        {customers.map((c) => <SelectItem key={c.id} value={c.id}>Khusus {c.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
