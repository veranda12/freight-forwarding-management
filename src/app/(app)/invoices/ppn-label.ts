/** Label PPN di ringkasan invoice, beserta alasan tarifnya. */
export function ppnLabel(rate: number, transport: boolean) {
  return `PPN ${(rate * 100).toLocaleString("id-ID", { maximumFractionDigits: 2 })}% (${transport ? "ada biaya transportasi" : "tanpa biaya transportasi"})`;
}
