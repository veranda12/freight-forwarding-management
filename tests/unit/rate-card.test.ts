import { describe, expect, it } from "vitest";
import { buildRateCardCharges, groupContainers, type RateItem } from "../../src/lib/rate-card";
import { amountInWords, numberToWords } from "../../src/lib/amount-words";

let seq = 0;
const item = (code: string, p: Partial<RateItem>): RateItem => ({
  id: `r${seq++}`, chargeCodeId: code, chargeCode: { code, name: code, asReceipt: false }, containerTypeId: null,
  basis: "PER_CONTAINER", condition: "ALWAYS", price: 0, thresholdKm: null, taxable: false, sortOrder: seq, ...p,
});

const RATES: RateItem[] = [
  item("CC", { price: 2_000_000 }),
  item("CC", { containerTypeId: "t20", price: 1_800_000 }),
  item("GREEN", { price: 1_650_000 }),
  item("GREEN", { containerTypeId: "t20", price: 1_500_000 }),
  item("REDLINE", { condition: "RED_LANE", price: 3_000_000 }),
  item("TRUCK", { price: 3_100_000 }),
  item("TRUCK", { containerTypeId: "t20", price: 2_900_000 }),
  item("XDIST", { basis: "PER_KM_OVER", price: 100_000, thresholdKm: 30 }),
  item("XDIST", { basis: "PER_KM_OVER", containerTypeId: "t20", price: 90_000, thresholdKm: 30 }),
  item("LOLO", { price: 800_000, chargeCode: { code: "LOLO", name: "LOLO", asReceipt: true } }),
  item("STORAGE", { condition: "OPTIONAL", price: 1_200_000 }),
  item("PIB", { basis: "PER_BL", price: 1_000_000 }),
];
const hc3 = [{ containerTypeId: "t40", code: "40HC", count: 3 }];
const byCode = (out: ReturnType<typeof buildRateCardCharges>) => Object.fromEntries(out.map((o) => [`${o.chargeCodeId}:${o.unitLabel}`, o]));

describe("buildRateCardCharges", () => {
  it("contoh client: 3 x 40HC jalur hijau 38 km", () => {
    const out = buildRateCardCharges(RATES, hc3, "GREEN", 38);
    const m = byCode(out);
    expect(m["CC:40HC"]).toMatchObject({ qty: 3, unitPrice: 2_000_000 });
    expect(m["GREEN:40HC"]).toMatchObject({ qty: 3, unitPrice: 1_650_000 });
    expect(m["TRUCK:40HC"]).toMatchObject({ qty: 3, unitPrice: 3_100_000 });
    expect(m["XDIST:40HC"]).toMatchObject({ qty: 3, unitPrice: 800_000 });
    expect(m["XDIST:40HC"].description).toContain("8 km over 30 km");
    expect(m["LOLO:40HC"].asReceipt).toBe(true);
    expect(m["PIB:B/L"]).toMatchObject({ qty: 1, unitPrice: 1_000_000 });
    expect(out.some((o) => o.chargeCodeId === "REDLINE" || o.chargeCodeId === "STORAGE")).toBe(false);
    expect(out.reduce((s, o) => s + o.qty * o.unitPrice, 0)).toBe(6_000_000 + 4_950_000 + 9_300_000 + 2_400_000 + 2_400_000 + 1_000_000);
  });
  it("20GP memakai tarif khusus, tipe lain memakai tarif umum", () => {
    const m = byCode(buildRateCardCharges(RATES, [{ containerTypeId: "t20", code: "20GP", count: 2 }, { containerTypeId: "t40g", code: "40GP", count: 1 }], "GREEN", 38));
    expect(m["CC:20GP"].unitPrice).toBe(1_800_000);
    expect(m["GREEN:20GP"].unitPrice).toBe(1_500_000);
    expect(m["TRUCK:20GP"].unitPrice).toBe(2_900_000);
    expect(m["XDIST:20GP"].unitPrice).toBe(720_000);
    expect(m["CC:40GP"].unitPrice).toBe(2_000_000);
    expect(m["XDIST:40GP"].unitPrice).toBe(800_000);
  });
  it("jalur merah menambah Red Line, Green Light tetap ditagih", () => {
    const m = byCode(buildRateCardCharges(RATES, hc3, "RED", 20));
    expect(m["REDLINE:40HC"]).toMatchObject({ qty: 3, unitPrice: 3_000_000 });
    expect(m["GREEN:40HC"]).toBeDefined();
  });
  it("jarak sampai batas tidak membuat surcharge, jarak kosong ditolak", () => {
    expect(buildRateCardCharges(RATES, hc3, "GREEN", 30).some((o) => o.chargeCodeId === "XDIST")).toBe(false);
    expect(() => buildRateCardCharges(RATES, hc3, "GREEN", null)).toThrow(/jarak/);
  });
  it("tanpa container ditolak, kecuali rate card hanya per B/L", () => {
    expect(() => buildRateCardCharges(RATES, [], "GREEN", 10)).toThrow(/container/);
    expect(buildRateCardCharges([item("PIB", { basis: "PER_BL", price: 1 })], [], null, null)).toHaveLength(1);
  });
  it("jarak per container: beda tujuan jadi baris terpisah dengan nomor container", () => {
    const groups = [
      { containerTypeId: "t20", code: "20GP", count: 2, units: [{ containerNo: "AAAU1111111", distanceKm: 38 }, { containerNo: "BBBU2222222", distanceKm: 52 }] },
      { containerTypeId: "t40", code: "40HC", count: 1, units: [{ containerNo: "CCCU3333333", distanceKm: null }] },
    ];
    const x = buildRateCardCharges(RATES, groups, "GREEN", 25).filter((o) => o.chargeCodeId === "XDIST");
    // 40HC ikut jarak job 25 km (di bawah batas), 20GP: 8 km dan 22 km di atas 30 km.
    expect(x).toHaveLength(2);
    expect(x[0]).toMatchObject({ qty: 1, unitPrice: 720_000, unitLabel: "20GP" });
    expect(x[0].description).toBe("AAAU1111111: 8 km over 30 km @ IDR 90,000/km");
    expect(x[1]).toMatchObject({ qty: 1, unitPrice: 1_980_000 });
    expect(x[1].description).toContain("BBBU2222222: 22 km");
    // Biaya per container lain tetap satu baris per tipe.
    expect(buildRateCardCharges(RATES, groups, "GREEN", 25).filter((o) => o.chargeCodeId === "CC")).toHaveLength(2);
  });
  it("semua container satu jarak: satu baris tanpa daftar nomor", () => {
    const groups = [{ containerTypeId: "t40", code: "40HC", count: 2, units: [{ containerNo: "AAAU1111111", distanceKm: 38 }, { containerNo: "BBBU2222222", distanceKm: null }] }];
    const x = buildRateCardCharges(RATES, groups, "GREEN", 38).filter((o) => o.chargeCodeId === "XDIST");
    expect(x).toEqual([expect.objectContaining({ qty: 2, unitPrice: 800_000, description: "8 km over 30 km @ IDR 100,000/km" })]);
  });
  it("container tanpa jarak dan job tanpa jarak ditolak dengan nomor containernya", () => {
    const groups = [{ containerTypeId: "t40", code: "40HC", count: 1, units: [{ containerNo: "AAAU1111111", distanceKm: null }] }];
    expect(() => buildRateCardCharges(RATES, groups, "GREEN", null)).toThrow(/AAAU1111111/);
  });
  it("tipe container tanpa tarif ditolak dengan pesan jelas", () => {
    expect(() => buildRateCardCharges([item("CC", { containerTypeId: "t20", price: 1 })], hc3, null, null)).toThrow(/40HC/);
  });
});

describe("groupContainers", () => {
  it("menghitung per tipe", () => {
    const g = groupContainers([
      { containerTypeId: "a", containerType: { code: "40HC" } }, { containerTypeId: "a", containerType: { code: "40HC" } },
      { containerTypeId: "b", containerType: { code: "20GP" } },
    ]);
    expect(g).toEqual([{ containerTypeId: "b", code: "20GP", count: 1 }, { containerTypeId: "a", code: "40HC", count: 2 }]);
  });
});

describe("amountInWords", () => {
  it("terbilang bahasa Inggris", () => {
    expect(numberToWords(0)).toBe("zero");
    expect(numberToWords(1_000_000)).toBe("one million");
    expect(amountInWords(49_847_370)).toBe("Forty-nine million eight hundred forty-seven thousand three hundred seventy Rupiah");
    expect(amountInWords(1_205.6)).toBe("One thousand two hundred six Rupiah");
  });
});
