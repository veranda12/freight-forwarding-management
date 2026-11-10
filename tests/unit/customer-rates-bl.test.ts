import { describe, expect, it } from "vitest";
import { buildRateCardCharges, type RateItem } from "../../src/lib/rate-card";
import { blConflict } from "../../src/lib/job-bl";
import { vendorPaymentCancelBlock } from "../../src/lib/payables";

let seq = 0;
const item = (code: string, p: Partial<RateItem>): RateItem => ({
  id: `r${seq++}`, chargeCodeId: code, chargeCode: { code, name: code, asReceipt: false }, containerTypeId: null, customerId: null,
  basis: "PER_CONTAINER", condition: "ALWAYS", price: 0, thresholdKm: null, thresholdKg: null, taxable: false, sortOrder: seq, ...p,
});
const g20 = [{ containerTypeId: "t20", code: "20GP", count: 2 }];
const g40 = [{ containerTypeId: "t40", code: "40HC", count: 1 }];
const priceOf = (out: ReturnType<typeof buildRateCardCharges>, code: string) => out.filter((o) => o.chargeCodeId === code).map((o) => o.unitPrice);

describe("rate card per customer", () => {
  const STD = [
    item("TRUCK", { price: 3_100_000 }),
    item("TRUCK", { containerTypeId: "t20", price: 2_900_000 }),
    item("CC", { price: 2_000_000 }),
    item("PIB", { basis: "PER_BL", price: 1_000_000 }),
  ];

  it("tanpa tarif khusus: sama persis dengan tarif standar", () => {
    const out = buildRateCardCharges(STD, g20, "GREEN", 10);
    expect(priceOf(out, "TRUCK")).toEqual([2_900_000]);
    expect(priceOf(out, "CC")).toEqual([2_000_000]);
    expect(priceOf(out, "PIB")).toEqual([1_000_000]);
  });

  it("tarif customer per tipe menggantikan standar tipe itu, charge lain tetap standar", () => {
    const rates = [...STD, item("TRUCK", { containerTypeId: "t20", customerId: "c1", price: 2_500_000 })];
    expect(priceOf(buildRateCardCharges(rates, g20, "GREEN", 10), "TRUCK")).toEqual([2_500_000]);
    expect(priceOf(buildRateCardCharges(rates, g20, "GREEN", 10), "CC")).toEqual([2_000_000]);
    // 40HC tidak punya tarif khusus: kembali ke standar semua tipe.
    expect(priceOf(buildRateCardCharges(rates, g40, "GREEN", 10), "TRUCK")).toEqual([3_100_000]);
  });

  it("tarif customer semua tipe mengalahkan tarif standar per tipe", () => {
    const rates = [...STD, item("TRUCK", { customerId: "c1", price: 2_700_000 })];
    expect(priceOf(buildRateCardCharges(rates, g20, "GREEN", 10), "TRUCK")).toEqual([2_700_000]);
    expect(priceOf(buildRateCardCharges(rates, g40, "GREEN", 10), "TRUCK")).toEqual([2_700_000]);
  });

  it("tarif customer per tipe mengalahkan tarif customer semua tipe", () => {
    const rates = [...STD, item("TRUCK", { customerId: "c1", price: 2_700_000 }), item("TRUCK", { customerId: "c1", containerTypeId: "t20", price: 2_400_000 })];
    expect(priceOf(buildRateCardCharges(rates, g20, "GREEN", 10), "TRUCK")).toEqual([2_400_000]);
    expect(priceOf(buildRateCardCharges(rates, g40, "GREEN", 10), "TRUCK")).toEqual([2_700_000]);
  });

  it("tarif per B/L customer menggantikan standar, urutan baris tetap", () => {
    const rates = [...STD, item("PIB", { basis: "PER_BL", customerId: "c1", price: 750_000, sortOrder: 999 })];
    const out = buildRateCardCharges(rates, g20, "GREEN", 10);
    expect(priceOf(out, "PIB")).toEqual([750_000]);
    expect(out.map((o) => o.chargeCodeId)).toEqual(["TRUCK", "CC", "PIB"]);
  });

  it("charge yang hanya ada di tarif customer ikut ditagih", () => {
    const rates = [...STD, item("HANDLING", { customerId: "c1", price: 300_000 })];
    expect(priceOf(buildRateCardCharges(rates, g20, "GREEN", 10), "HANDLING")).toEqual([300_000]);
  });

  it("surcharge overweight customer dipakai sebelum tarif standar", () => {
    const rates = [
      item("OVWT", { basis: "OVERWEIGHT", containerTypeId: "t20", price: 600_000, thresholdKg: 23_000 }),
      item("OVWT", { basis: "OVERWEIGHT", containerTypeId: "t20", customerId: "c1", price: 500_000, thresholdKg: 24_000 }),
    ];
    const unit = (kg: number) => [{ containerTypeId: "t20", code: "20GP", count: 1, units: [{ containerNo: "AAAU1111111", distanceKm: 10, weightKg: kg }] }];
    expect(priceOf(buildRateCardCharges(rates, unit(23_500), "GREEN", null), "OVWT")).toEqual([]);
    expect(priceOf(buildRateCardCharges(rates, unit(25_000), "GREEN", null), "OVWT")).toEqual([500_000]);
  });
});

describe("tolak No. B/L ganda", () => {
  const sea = (master: string | null, house: string | null) => ({ air: false, master, house });
  it("House B/L sama ditolak, tanpa beda huruf besar kecil", () => {
    expect(blConflict(sea("MAEU1", "SLL01"), [{ number: "JOB/1", master: "MAEU9", house: "sll01" }])).toBe("House B/L SLL01 sudah dipakai job JOB/1.");
  });
  it("Master B/L sama boleh untuk konsolidasi bila dua-duanya punya House B/L", () => {
    expect(blConflict(sea("MAEU1", "SLL02"), [{ number: "JOB/1", master: "MAEU1", house: "SLL01" }])).toBeNull();
  });
  it("Master B/L sama ditolak bila salah satu job tanpa House B/L", () => {
    expect(blConflict(sea("MAEU1", null), [{ number: "JOB/1", master: "MAEU1", house: "SLL01" }])).toMatch(/Master B\/L MAEU1 sudah dipakai job JOB\/1/);
    expect(blConflict(sea("MAEU1", "SLL02"), [{ number: "JOB/1", master: "maeu1", house: null }])).toMatch(/sudah dipakai/);
  });
  it("AWB memakai label MAWB/HAWB, nomor kosong tidak dicek", () => {
    expect(blConflict({ air: true, master: null, house: "H1" }, [{ number: "JOB/2", master: null, house: "H1" }])).toMatch(/^HAWB H1/);
    expect(blConflict(sea(null, null), [{ number: "JOB/1", master: null, house: null }])).toBeNull();
  });
});

describe("batal pembayaran vendor bill", () => {
  const base = {
    direction: "PAYMENT", hasBill: true, cancelledAt: null, date: new Date("2026-11-05T05:00:00Z"), lockKey: null,
    reconciled: false, reconciledAt: null, fxRevalAfter: false, voucherNumber: null,
  };
  it("pesan untuk setiap batasan", () => {
    expect(vendorPaymentCancelBlock(base)).toBeNull();
    expect(vendorPaymentCancelBlock({ ...base, direction: "RECEIPT" })).toMatch(/vendor bill/);
    expect(vendorPaymentCancelBlock({ ...base, hasBill: false })).toMatch(/vendor bill/);
    expect(vendorPaymentCancelBlock({ ...base, cancelledAt: new Date() })).toMatch(/sudah dibatalkan/);
    expect(vendorPaymentCancelBlock({ ...base, voucherNumber: "SLG/VC/26/11/001" })).toMatch(/voucher SLG\/VC\/26\/11\/001/);
    expect(vendorPaymentCancelBlock({ ...base, reconciled: true, reconciledAt: new Date("2026-11-07T05:00:00Z") })).toMatch(/direkonsiliasi pada 07 Nov 2026/);
    expect(vendorPaymentCancelBlock({ ...base, lockKey: "2026-11-30" })).toBe("Periode November 2026 sudah tutup buku. Buka dulu periodenya di menu Tutup Buku.");
    expect(vendorPaymentCancelBlock({ ...base, lockKey: "2026-10-31" })).toBeNull();
    expect(vendorPaymentCancelBlock({ ...base, fxRevalAfter: true })).toMatch(/revaluasi/);
  });
});
