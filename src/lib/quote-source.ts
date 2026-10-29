export type CostSource = "VENDOR" | "OWN_FLEET";

export type QuoteLineSource = { costSource?: string | null; vendorId?: string | null; vehicleId?: string | null };

/**
 * Menentukan vendor atau armada untuk baris biaya beli.
 * VENDOR: boleh pilih vendor (kosong = belum ditentukan), armada diabaikan.
 * OWN_FLEET: pakai armada sendiri, vendor diabaikan. Armada boleh kosong dan diisi nanti di job.
 */
export function resolveBuyingSource(line: QuoteLineSource): { costSource: CostSource; vendorId: string | null; vehicleId: string | null } {
  const src: CostSource = line.costSource === "OWN_FLEET" ? "OWN_FLEET" : "VENDOR";
  if (src === "OWN_FLEET") return { costSource: src, vendorId: null, vehicleId: line.vehicleId || null };
  return { costSource: src, vendorId: line.vendorId || null, vehicleId: null };
}

/** Label sumber untuk tampilan: nama vendor, atau plat armada sendiri. */
export function sourceLabel(src: { vendorName?: string | null; plate?: string | null }): string {
  if (src.plate) return `Armada ${src.plate}`;
  return src.vendorName ?? "-";
}
