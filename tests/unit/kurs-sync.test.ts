import { describe, expect, it } from "vitest";
import { computeIdrRates, type FrankfurterResponse } from "@/lib/kurs-sync";
import { validateCurrencyInput, validateRateInput } from "@/lib/currencies";

// Contoh respons nyata dari Frankfurter (base USD), tanggal 2026-10-26.
const sample: FrankfurterResponse = {
  amount: 1,
  base: "USD",
  date: "2026-10-26",
  rates: { CNY: 6.6681, EUR: 0.89381, IDR: 18162, JPY: 157.45, SGD: 1.2806 },
};

describe("computeIdrRates", () => {
  it("USD memakai kurs IDR per USD langsung", () => {
    const r = computeIdrRates(sample, ["USD", "IDR"]);
    expect(r.idrRates.USD).toBe(18162);
    expect(r.date).toBe("2026-10-26");
  });

  it("mata uang lain = IDR per USD dibagi unit per USD", () => {
    const r = computeIdrRates(sample, ["USD", "SGD", "EUR", "CNY"]);
    expect(r.idrRates.SGD).toBeCloseTo(18162 / 1.2806, 3);
    expect(r.idrRates.EUR).toBeCloseTo(18162 / 0.89381, 2);
    expect(r.idrRates.CNY).toBeCloseTo(18162 / 6.6681, 2);
  });

  it("mata uang yang tidak ada di respons dilewati, bukan dipalsukan", () => {
    const r = computeIdrRates(sample, ["USD", "AUD"]);
    expect(r.idrRates.AUD).toBeUndefined();
    expect(r.skipped).toEqual(["AUD"]);
  });

  it("menolak respons dengan basis selain USD atau tanpa IDR", () => {
    expect(() => computeIdrRates({ ...sample, base: "EUR" }, ["USD"])).toThrow();
    expect(() => computeIdrRates({ ...sample, rates: { SGD: 1.28 } }, ["USD"])).toThrow();
  });
});

describe("validasi mata uang dan kurs manual", () => {
  it("kode mata uang dirapikan ke huruf besar dan harus 3 huruf", () => {
    expect(validateCurrencyInput({ code: " aud ", name: "Australian Dollar" }).code).toBe("AUD");
    expect(() => validateCurrencyInput({ code: "AUSD", name: "X" })).toThrow();
    expect(() => validateCurrencyInput({ code: "IDR", name: "Rupiah" })).toThrow();
    expect(() => validateCurrencyInput({ code: "AUD", name: " " })).toThrow();
  });

  it("kurs harus positif dan tanggal tidak boleh di masa depan", () => {
    expect(validateRateInput({ currency: "usd", date: "2026-10-20", rate: 16000 }).currency).toBe("USD");
    expect(() => validateRateInput({ currency: "USD", date: "2026-10-20", rate: 0 })).toThrow();
    expect(() => validateRateInput({ currency: "IDR", date: "2026-10-20", rate: 1 })).toThrow();
    expect(() => validateRateInput({ currency: "USD", date: "2999-01-01", rate: 1 })).toThrow();
    expect(() => validateRateInput({ currency: "USD", date: "20-10-2026", rate: 1 })).toThrow();
  });
});
