import { describe, it, expect } from "vitest";
import { nextCoaCode, validateBankAccountInput } from "@/lib/cash-accounts";
import { validateCashEntry } from "@/lib/cash-entry";

describe("nextCoaCode", () => {
  it("rekening bank mulai dari 1201, kas dari 1101", () => {
    expect(nextCoaCode(["1100", "1200", "1300"], "BANK")).toBe("1201");
    expect(nextCoaCode(["1100", "1200"], "CASH")).toBe("1101");
  });
  it("melewati kode yang sudah dipakai", () => {
    expect(nextCoaCode(["1200", "1201", "1202", "1204"], "BANK")).toBe("1203");
  });
  it("error jika rentang penuh", () => {
    const all = Array.from({ length: 99 }, (_, i) => String(1201 + i));
    expect(() => nextCoaCode(all, "BANK")).toThrow(/penuh/);
  });
});

describe("validateBankAccountInput", () => {
  const base = { kind: "BANK" as const, name: "BCA Gaji", bankName: "BCA", accountNo: "088 123 4568", currency: "idr" };
  it("menormalisasi nomor rekening dan mata uang", () => {
    const v = validateBankAccountInput(base);
    expect(v.accountNo).toBe("0881234568");
    expect(v.currency).toBe("IDR");
    expect(v.isActive).toBe(true);
  });
  it("rekening bank wajib nama bank dan nomor rekening yang valid", () => {
    expect(() => validateBankAccountInput({ ...base, bankName: "" })).toThrow(/Nama bank/);
    expect(() => validateBankAccountInput({ ...base, accountNo: "12ab" })).toThrow(/Nomor rekening/);
  });
  it("kas tidak perlu nomor rekening", () => {
    expect(validateBankAccountInput({ kind: "CASH", name: "Kas Gudang" }).accountNo).toBeNull();
  });
  it("menolak nama terlalu pendek dan mata uang tidak valid", () => {
    expect(() => validateBankAccountInput({ ...base, name: "AB" })).toThrow(/Nama rekening/);
    expect(() => validateBankAccountInput({ ...base, currency: "RUPIAH" })).toThrow(/Mata uang/);
  });
});

describe("validateCashEntry", () => {
  const base = { direction: "OUT" as const, bankAccountId: "b", counterAccountId: "c", amount: 6500, dateKey: "2026-10-29", description: "Biaya admin" };
  it("menerima input valid", () => {
    expect(validateCashEntry(base)).toMatchObject({ amount: 6500, reference: null });
  });
  it("menolak nominal nol, tanggal salah, dan keterangan kosong", () => {
    expect(() => validateCashEntry({ ...base, amount: 0 })).toThrow(/Nominal/);
    expect(() => validateCashEntry({ ...base, dateKey: "29-10-2026" })).toThrow(/Tanggal/);
    expect(() => validateCashEntry({ ...base, description: " " })).toThrow(/Keterangan/);
    expect(() => validateCashEntry({ ...base, counterAccountId: "" })).toThrow(/akun lawan/);
  });
});
