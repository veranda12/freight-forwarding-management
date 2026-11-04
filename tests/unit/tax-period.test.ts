import { describe, it, expect } from "vitest";
import { isPeriod, periodLabel, periodRange, remainingForPeriod, masaStatus } from "@/lib/tax-period";

const T = { ppnOut: 825000, ppnIn: 330000, pph23: 60000, pph26: 0 };

describe("masa pajak", () => {
  it("validasi dan label masa", () => {
    expect(isPeriod("2026-10")).toBe(true);
    expect(isPeriod("2026-13")).toBe(false);
    expect(isPeriod("2026-1")).toBe(false);
    expect(periodLabel("2026-10")).toBe("Oktober 2026");
  });

  it("rentang masa memakai zona Jakarta, termasuk Desember", () => {
    const r = periodRange("2026-12");
    expect(r.start.toISOString()).toBe("2026-11-30T17:00:00.000Z");
    expect(r.end.toISOString()).toBe("2026-12-31T16:59:59.999Z");
  });
});

describe("remainingForPeriod", () => {
  it("PPN: keluaran dikurangi masukan", () => {
    expect(remainingForPeriod("PPN", T, [])).toMatchObject({ tax: 495000, paid: 0, out: 825000, inn: 330000, payable: 495000 });
  });

  it("setelah disetor penuh, sisa nol", () => {
    const r = remainingForPeriod("PPN", T, [{ amount: 495000, outAmount: 825000, inAmount: 330000 }]);
    expect(r).toMatchObject({ paid: 495000, out: 0, inn: 0, payable: 0 });
  });

  it("pembetulan: hanya selisih dokumen baru yang tersisa", () => {
    const r = remainingForPeriod("PPN", { ...T, ppnOut: 925000 }, [{ amount: 495000, outAmount: 825000, inAmount: 330000 }]);
    expect(r.payable).toBe(100000);
  });

  it("PPh 23 dan PPh 26", () => {
    expect(remainingForPeriod("PPH23", T, []).payable).toBe(60000);
    expect(remainingForPeriod("PPH23", T, [{ amount: 60000, outAmount: 60000, inAmount: 0 }]).payable).toBe(0);
    expect(remainingForPeriod("PPH26", T, []).payable).toBe(0);
  });
});

describe("masaStatus", () => {
  it("status sesuai kondisi masa", () => {
    expect(masaStatus("PPH26", T, [])).toBe("NONE");
    expect(masaStatus("PPN", T, [])).toBe("UNPAID");
    expect(masaStatus("PPN", T, [{ amount: 495000, outAmount: 825000, inAmount: 330000 }])).toBe("PAID");
    expect(masaStatus("PPN", { ...T, ppnOut: 925000 }, [{ amount: 495000, outAmount: 825000, inAmount: 330000 }])).toBe("PARTIAL");
    expect(masaStatus("PPN", { ...T, ppnOut: 100000 }, [])).toBe("OVERPAID");
  });
});
