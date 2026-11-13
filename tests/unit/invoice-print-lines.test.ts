import { describe, expect, it } from "vitest";
import { mergeReceiptLines } from "@/lib/pdf/invoice-print-lines";

const line = (name: string, note: string | null, qty: number, unitPrice: number, asReceipt = true, unitLabel: string | null = null) =>
  ({ section: "LOCAL" as const, name, note, qty, unitLabel, unitPrice, amount: qty * unitPrice, asReceipt });

describe("mergeReceiptLines", () => {
  it("LOLO lift off dan lift on beda vendor dicetak satu baris, nominal dijumlah", () => {
    const out = mergeReceiptLines([
      line("Customs Clearance", null, 2, 2_000_000, false, "40HC"),
      line("LOLO Fee", "lift off", 2, 1_276_500),
      line("Behandle Fee", "by. behandle", 1, 4_070_925),
      line("LOLO Fee", "lift on", 2, 1_500_000),
    ]);
    expect(out.map((l) => l.name)).toEqual(["Customs Clearance", "LOLO Fee", "Behandle Fee"]);
    expect(out[1]).toMatchObject({ qty: 2, unitPrice: 2_776_500, amount: 5_553_000, note: "Lift off & Lift on" });
  });

  it("qty berbeda: dicetak 1 x total", () => {
    const [l] = mergeReceiptLines([line("Storage Fee", "kuitansi 1", 1, 500_000), line("Storage Fee", "kuitansi 2", 3, 100_000)]);
    expect(l).toMatchObject({ qty: 1, unitLabel: null, unitPrice: 800_000, amount: 800_000 });
  });

  it("baris non-reimburse dan B/L berbeda tidak digabung", () => {
    const out = mergeReceiptLines([
      line("Customs Clearance", null, 1, 2_000_000, false, "20RF"),
      line("Customs Clearance", null, 1, 2_000_000, false, "40HC"),
      { ...line("LOLO Fee", "lift on", 1, 1_000), bl: "BL-A" },
      { ...line("LOLO Fee", "lift on", 1, 1_000), bl: "BL-B" },
    ]);
    expect(out).toHaveLength(4);
  });
});
