import { describe, expect, it } from "vitest";
import { invoiceBlocks, type PdfInvoiceLine } from "@/lib/pdf/invoice-document";

const line = (section: PdfInvoiceLine["section"], name: string, amount: number, asReceipt: boolean): PdfInvoiceLine =>
  ({ section, name, note: null, qty: 1, unitLabel: null, unitPrice: amount, amount, asReceipt });

describe("invoiceBlocks", () => {
  it("reimburse di blok atas, jasa di blok bawah, huruf seksi berlanjut", () => {
    const blocks = invoiceBlocks({
      lines: [
        line("LOCAL", "Customs Clearance", 2_000_000, false),
        line("LOCAL", "LOLO", 1_420_800, true),
        line("ADDITIONAL", "Trucking", 3_100_000, false),
        line(null, "Storage", 2_300_000, true),
      ],
      excluded: [{ section: "LOCAL", name: "Behandle", unitLabel: null, reason: "Red lane only" }],
    });
    expect(blocks.map((b) => b.kind)).toEqual(["RECEIPT", "SERVICE"]);
    expect(blocks[0].subtotal).toBe(3_720_800);
    expect(blocks[0].groups.map((g) => g.letter)).toEqual(["A", "B"]);
    expect(blocks[1].subtotal).toBe(5_100_000);
    expect(blocks[1].groups[0].letter).toBe("C");
    expect(blocks[0].groups.every((g) => g.lines.every((l) => l.asReceipt))).toBe(true);
    // Excluded ikut blok jasa karena seksi LOCAL ada di sana.
    expect(blocks[0].groups.flatMap((g) => g.excluded)).toHaveLength(0);
    expect(blocks[1].groups.flatMap((g) => g.excluded)).toHaveLength(1);
  });

  it("tanpa reimburse hanya ada blok jasa", () => {
    const blocks = invoiceBlocks({ lines: [line("LOCAL", "Handling", 500_000, false)], excluded: [] });
    expect(blocks.map((b) => b.kind)).toEqual(["SERVICE"]);
    expect(blocks[0].groups[0].letter).toBe("A");
  });
});
