import { describe, it, expect } from "vitest";
import { faker } from "@faker-js/faker/locale/id_ID";
import { containerNumber } from "../../prisma/seed-helpers";

// Perhitungan check digit ISO 6346 independen (acuan kebenaran)
const CHAR_VALUES: Record<string, number> = (() => {
  const map: Record<string, number> = {};
  let value = 10;
  for (let i = 0; i < 26; i++) {
    const ch = String.fromCharCode(65 + i);
    while (value % 11 === 0) value++;
    map[ch] = value;
    value++;
  }
  return map;
})();

function expectedCheckDigit(base10: string): number {
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const ch = base10[i];
    const val = /[0-9]/.test(ch) ? Number(ch) : CHAR_VALUES[ch];
    sum += val * Math.pow(2, i);
  }
  let check = sum % 11;
  if (check === 10) check = 0;
  return check;
}

describe("ISO 6346 container number", () => {
  it("menghasilkan format OWNER(4) SERIAL(6) CHECK(1) dengan check digit valid", () => {
    faker.seed(123);
    for (let i = 0; i < 200; i++) {
      const cn = containerNumber();
      const parts = cn.split(" ");
      expect(parts).toHaveLength(3);
      const [owner, serial, check] = parts;
      expect(owner).toMatch(/^[A-Z]{4}$/);
      expect(serial).toMatch(/^[0-9]{6}$/);
      expect(check).toMatch(/^[0-9]$/);
      const expected = expectedCheckDigit(owner + serial);
      expect(Number(check)).toBe(expected);
    }
  });

  it("menghormati owner code yang diberikan", () => {
    faker.seed(1);
    const cn = containerNumber("MSKU");
    expect(cn.startsWith("MSKU ")).toBe(true);
  });
});
