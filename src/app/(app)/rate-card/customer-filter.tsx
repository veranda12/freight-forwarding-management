"use client";

import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Pindah saringan dengan tetap mempertahankan saringan lain (customer dan kota). */
function useFilterNav(current: Record<string, string>) {
  const router = useRouter();
  return (key: string, v: string) => {
    const p = new URLSearchParams({ ...current, [key]: v });
    for (const [k, val] of [...p.entries()]) if (val === "all") p.delete(k);
    const q = p.toString();
    router.push(q ? `/rate-card?${q}` : "/rate-card");
  };
}

/** Saring rate card: semua baris (`all`), tarif standar saja (`std`), atau tarif khusus satu customer (id). */
export function CustomerFilter({ value, customers, city = "all" }: { value: string; customers: { id: string; label: string }[]; city?: string }) {
  const go = useFilterNav({ customer: value, city });
  return (
    <Select value={value} onValueChange={(v) => go("customer", v)}>
      <SelectTrigger aria-label="Saring customer" className="w-full sm:w-72"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Semua tarif</SelectItem>
        <SelectItem value="std">Tarif standar saja</SelectItem>
        {customers.map((c) => <SelectItem key={c.id} value={c.id}>Khusus {c.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

/** Saring rate card per kota: semua (`all`), tarif tanpa kota saja (`none`), atau satu kota. */
export function CityFilter({ value, cities, customer = "all" }: { value: string; cities: string[]; customer?: string }) {
  const go = useFilterNav({ customer, city: value });
  return (
    <Select value={value} onValueChange={(v) => go("city", v)}>
      <SelectTrigger aria-label="Saring kota" className="w-full sm:w-56"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Semua kota</SelectItem>
        <SelectItem value="none">Tarif tanpa kota saja</SelectItem>
        {cities.map((c) => <SelectItem key={c} value={c}>Kota {c}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
