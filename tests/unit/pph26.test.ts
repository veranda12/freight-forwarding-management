import { describe, expect, it } from "vitest";
import { pph26Of } from "@/lib/accounting-core";

describe("pph26Of", () => {
  it("tarif 20% dari nilai baris", () => {
    expect(pph26Of(1_000_000, 20)).toBe(200_000);
  });

  it("tarif 0 tidak memotong, dan pembulatan ke rupiah sen", () => {
    expect(pph26Of(1_000_000, 0)).toBe(0);
    expect(pph26Of(333_333, 10)).toBe(33_333.3);
  });
});
