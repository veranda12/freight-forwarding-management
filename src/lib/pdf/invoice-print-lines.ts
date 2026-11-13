import type { PdfInvoiceLine } from "./invoice-document";

const r2 = (n: number) => Math.round(n * 100) / 100;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Baris reimburse dengan charge yang sama dicetak satu baris (permintaan client 13 Nov): mis. LOLO lift on dari
 * vendor A dan lift off dari vendor B menjadi satu "LOLO Fee" dengan nominal dijumlah dan keterangan "Lift on & Lift off".
 * Di costing dan invoice tetap dua baris (masing-masing tersambung ke bill vendornya); ini hanya untuk cetakan.
 * Baris non-reimburse tidak digabung, karena tarifnya bisa berbeda per tipe container. `bl` memisahkan B/L di invoice gabungan.
 * Qty dan unit sama di semua baris: qty dipertahankan, harga satuan dijumlah. Selain itu: 1 x total.
 */
export function mergeReceiptLines<T extends PdfInvoiceLine & { bl?: string | null }>(lines: T[]): T[] {
  const groups = new Map<string, T[]>();
  const order: (T | string)[] = [];
  for (const l of lines) {
    if (!l.asReceipt) { order.push(l); continue; }
    const k = `${l.section}|${l.name}|${l.bl ?? ""}`;
    if (!groups.has(k)) { groups.set(k, []); order.push(k); }
    groups.get(k)!.push(l);
  }
  return order.map((o) => {
    if (typeof o !== "string") return o;
    const group = groups.get(o)!;
    const first = group[0];
    if (group.length === 1) return first;
    const amount = r2(group.reduce((t, g) => t + g.amount, 0));
    const uniform = first.qty > 0 && group.every((g) => g.qty === first.qty && g.unitLabel === first.unitLabel);
    const notes = [...new Set(group.map((g) => g.note?.trim()).filter((n): n is string => !!n).map(cap))];
    return {
      ...first, amount, note: notes.length ? notes.join(" & ") : null,
      qty: uniform ? first.qty : 1, unitLabel: uniform ? first.unitLabel : null, unitPrice: uniform ? r2(amount / first.qty) : amount,
    };
  });
}
