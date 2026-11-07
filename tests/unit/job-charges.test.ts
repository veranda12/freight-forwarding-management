import { describe, expect, it } from "vitest";
import { chargeLockReason, validateJobCharge } from "../../src/lib/job-charges";

const base = { side: "SELLING" as const, chargeCodeId: "cc", qty: 1, unitPrice: 1000, taxable: true };

describe("validateJobCharge", () => {
  it("menerima input IDR dan default IDR", () => {
    const v = validateJobCharge(base);
    expect(v.currency).toBe("IDR");
    expect(v.qty).toBe(1);
    expect(v.unitPrice).toBe(1000);
  });
  it("menolak qty nol atau minus", () => {
    expect(() => validateJobCharge({ ...base, qty: 0 })).toThrow(/Qty/);
    expect(() => validateJobCharge({ ...base, qty: -1 })).toThrow(/Qty/);
  });
  it("menolak harga minus, menerima harga nol", () => {
    expect(() => validateJobCharge({ ...base, unitPrice: -5 })).toThrow(/minus/);
    expect(validateJobCharge({ ...base, unitPrice: 0 }).unitPrice).toBe(0);
  });
  it("wajib charge code", () => {
    expect(() => validateJobCharge({ ...base, chargeCodeId: "" })).toThrow(/charge code/);
  });
  it("menolak kurs nol untuk valas, kosong berarti kurs otomatis", () => {
    expect(() => validateJobCharge({ ...base, currency: "USD", rate: 0 })).toThrow(/Kurs/);
    expect(validateJobCharge({ ...base, currency: "usd", rate: "" }).rate).toBeNull();
    expect(validateJobCharge({ ...base, currency: "usd" }).currency).toBe("USD");
  });
  it("vendor dan armada hanya untuk buying, vendor menang atas armada", () => {
    expect(validateJobCharge({ ...base, vendorId: "v", vehicleId: "x" }).vendorId).toBeNull();
    const b = validateJobCharge({ ...base, side: "BUYING", vendorId: "v", vehicleId: "x" });
    expect(b.vendorId).toBe("v");
    expect(b.vehicleId).toBeNull();
    expect(validateJobCharge({ ...base, side: "BUYING", vehicleId: "x" }).vehicleId).toBe("x");
  });
});

describe("chargeLockReason", () => {
  const free = { side: "SELLING", invoiced: false, billed: false, recordedAt: null };
  it("baris bebas tidak terkunci", () => expect(chargeLockReason(free)).toBeNull());
  it("selling yang sudah ditagih terkunci", () => expect(chargeLockReason({ ...free, invoiced: true })).toMatch(/pembayaran/));
  it("buying yang sudah di-bill atau dicatat terkunci", () => {
    expect(chargeLockReason({ ...free, side: "BUYING", billed: true })).toMatch(/bill/);
    expect(chargeLockReason({ ...free, side: "BUYING", recordedAt: new Date() })).toMatch(/armada/);
  });
});
