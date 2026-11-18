import { describe, expect, it } from "vitest";
import { validateJobCharge } from "@/lib/job-charges";
import { newTaxRow, syncLinePpnRows } from "@/components/tax-rows-editor";
import { validateTaxRows } from "@/lib/tax-rows";

const buying = { side: "BUYING" as const, chargeCodeId: "c", qty: 1, unitPrice: 1000, taxable: true };

describe("PPN masukan per baris buying (nominal sesuai invoice vendor)", () => {
  it("nominal diketik apa adanya; kosong berarti tanpa PPN; undefined berarti tidak diubah", () => {
    expect(validateJobCharge({ ...buying, ppnIdr: "24200" }).ppnIdr).toBe(24_200);
    expect(validateJobCharge({ ...buying, ppnIdr: "403425.5" }).ppnIdr).toBe(403_425.5);
    expect(validateJobCharge({ ...buying, ppnIdr: "" }).ppnIdr).toBe(0);
    expect(validateJobCharge(buying).ppnIdr).toBeUndefined();
    expect(() => validateJobCharge({ ...buying, ppnIdr: -1 })).toThrow(/minus/);
  });

  it("PPN ditolak untuk selling dan biaya reimburse", () => {
    expect(() => validateJobCharge({ ...buying, side: "SELLING", ppnIdr: 1100 })).toThrow(/hanya untuk buying/);
    expect(() => validateJobCharge({ ...buying, asReceipt: true, ppnIdr: 1100 })).toThrow(/reimburse/i);
  });

  it("voucher: satu baris PPN Masukan per biaya ber-PPN, reimburse dilewati, baris pajak manual tetap", () => {
    const pph = newTaxRow("PPH23", "2000", "PPh 23");
    const rows = syncLinePpnRows([pph], [
      { label: "HANDLING Handling Fee", ppnIdr: 82_500, reimburse: false },
      { label: "TRUCK Trucking", ppnIdr: 24_200, reimburse: false },
      { label: "KULI Kuli pabrik", ppnIdr: 0, reimburse: true },
    ]);
    expect(rows.map((r) => [r.kind, r.amount, r.description, !!r.auto])).toEqual([
      ["PPN_IN", "82500", "PPN Masukan HANDLING Handling Fee", true],
      ["PPN_IN", "24200", "PPN Masukan TRUCK Trucking", true],
      ["PPH23", "2000", "PPh 23", false],
    ]);
    // Pilihan berubah: baris otomatis diganti, tidak bertumpuk.
    const again = syncLinePpnRows(rows, [{ label: "LOLO", ppnIdr: 70_400, reimburse: false }]);
    expect(again.filter((r) => r.auto).map((r) => r.amount)).toEqual(["70400"]);
    expect(again.filter((r) => !r.auto)).toHaveLength(1);
    const v = validateTaxRows(again.map((r) => ({ kind: r.kind, amount: r.amount, description: r.description })), { total: 640_000, nonReimburse: 640_000 });
    expect(v.net).toBe(640_000 + 70_400 - 2_000);
  });
});
