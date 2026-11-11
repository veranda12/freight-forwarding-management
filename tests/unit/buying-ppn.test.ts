import { describe, expect, it } from "vitest";
import { ppnOf, validateJobCharge } from "@/lib/job-charges";
import { newTaxRow, syncLinePpnRows } from "@/components/tax-rows-editor";
import { validateTaxRows } from "@/lib/tax-rows";

const buying = { side: "BUYING" as const, chargeCodeId: "c", qty: 1, unitPrice: 1000, taxable: true };

describe("PPN masukan per baris buying", () => {
  it("nilai PPN dibulatkan ke rupiah penuh, tarif berbeda", () => {
    expect(ppnOf(1_000_000, 11)).toBe(110_000);
    expect(ppnOf(1_000_000, 1.1)).toBe(11_000);
    expect(ppnOf(1_234_567, 12)).toBe(148_148);
  });

  it("tarif divalidasi; kosong berarti tanpa PPN; undefined berarti tidak diubah", () => {
    expect(validateJobCharge({ ...buying, ppnRate: "11" }).ppnRate).toBe(11);
    expect(validateJobCharge({ ...buying, ppnRate: "" }).ppnRate).toBeNull();
    expect(validateJobCharge({ ...buying, ppnRate: 0 }).ppnRate).toBeNull();
    expect(validateJobCharge(buying).ppnRate).toBeUndefined();
    expect(() => validateJobCharge({ ...buying, ppnRate: 150 })).toThrow(/antara 0 dan 100/);
    expect(() => validateJobCharge({ ...buying, ppnRate: -1 })).toThrow(/antara 0 dan 100/);
  });

  it("PPN ditolak untuk selling dan biaya reimburse", () => {
    expect(() => validateJobCharge({ ...buying, side: "SELLING", ppnRate: 11 })).toThrow(/hanya untuk buying/);
    expect(() => validateJobCharge({ ...buying, asReceipt: true, ppnRate: 11 })).toThrow(/reimburse/);
  });

  it("voucher: PPN baris buying jadi baris PPN Masukan per tarif, baris pajak manual tetap", () => {
    const pph = newTaxRow("PPH23", "2000", "PPh 23");
    const rows = syncLinePpnRows([pph], [
      { ppnRate: 11, ppnIdr: 110_000, reimburse: false },
      { ppnRate: 11, ppnIdr: 55_000, reimburse: false },
      { ppnRate: 1.1, ppnIdr: 1_100, reimburse: false },
      { ppnRate: 11, ppnIdr: 99_000, reimburse: true },
      { ppnRate: null, ppnIdr: 0, reimburse: false },
    ]);
    expect(rows.map((r) => [r.kind, r.amount, r.description, !!r.auto])).toEqual([
      ["PPN_IN", "165000", "PPN Masukan 11%", true],
      ["PPN_IN", "1100", "PPN Masukan 1,1%", true],
      ["PPH23", "2000", "PPh 23", false],
    ]);
    // Pilihan berubah: baris otomatis diganti, tidak bertumpuk.
    const again = syncLinePpnRows(rows, [{ ppnRate: 12, ppnIdr: 12_000, reimburse: false }]);
    expect(again.filter((r) => r.auto).map((r) => r.amount)).toEqual(["12000"]);
    expect(again.filter((r) => !r.auto)).toHaveLength(1);
    // Lolos validasi server: kas = biaya + PPN - PPh.
    const v = validateTaxRows(again.map((r) => ({ kind: r.kind, amount: r.amount, description: r.description })), { total: 100_000, nonReimburse: 100_000 });
    expect(v.net).toBe(110_000);
  });
});
