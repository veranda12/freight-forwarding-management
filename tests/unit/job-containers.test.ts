import { describe, it, expect } from "vitest";
import { isoCheckDigit, validateContainerNo, validateJobContainerInput } from "@/lib/job-containers";

const base = { containerNo: "CSQU3054383", containerTypeId: "type-40hc", sealNo: "sl1234567", grossWeightKg: 20000, volumeCbm: 67.5 };

describe("isoCheckDigit (ISO 6346)", () => {
  it("contoh standar CSQU305438 menghasilkan digit cek 3", () => {
    expect(isoCheckDigit("CSQU305438")).toBe(3);
  });

  it("nomor dengan digit cek salah ditolak", () => {
    expect(() => validateContainerNo("CSQU3054384")).toThrow(/ISO 6346/);
  });
});

describe("validateContainerNo", () => {
  it("menerima nomor valid dan menormalisasi huruf besar serta spasi", () => {
    expect(validateContainerNo(" csqu 3054383 ")).toBe("CSQU3054383");
  });

  it("menolak format yang salah", () => {
    expect(() => validateContainerNo("CSQU305438")).toThrow(/11 karakter/);
    expect(() => validateContainerNo("CSQX3054383")).toThrow(/11 karakter/);
    expect(() => validateContainerNo("12345678901")).toThrow(/11 karakter/);
  });
});

describe("validateJobContainerInput", () => {
  it("menerima input lengkap dan menormalisasi seal", () => {
    const v = validateJobContainerInput(base);
    expect(v.containerNo).toBe("CSQU3054383");
    expect(v.sealNo).toBe("SL1234567");
    expect(v.grossWeightKg).toBe(20000);
    expect(v.volumeCbm).toBe(67.5);
  });

  it("seal, berat, dan volume boleh kosong", () => {
    const v = validateJobContainerInput({ containerNo: "CSQU3054383", containerTypeId: "t", sealNo: "", grossWeightKg: "", volumeCbm: null });
    expect(v.sealNo).toBeNull();
    expect(v.grossWeightKg).toBeNull();
    expect(v.volumeCbm).toBeNull();
  });

  it("tipe wajib dipilih", () => {
    expect(() => validateJobContainerInput({ ...base, containerTypeId: "" })).toThrow(/Tipe container/);
  });

  it("berat dan volume di luar batas ditolak", () => {
    expect(() => validateJobContainerInput({ ...base, grossWeightKg: 0 })).toThrow(/Berat kotor/);
    expect(() => validateJobContainerInput({ ...base, grossWeightKg: 50000 })).toThrow(/Berat kotor/);
    expect(() => validateJobContainerInput({ ...base, volumeCbm: 300 })).toThrow(/Volume/);
    expect(() => validateJobContainerInput({ ...base, grossWeightKg: "abc" })).toThrow(/angka/);
  });

  it("seal lebih dari 30 karakter ditolak", () => {
    expect(() => validateJobContainerInput({ ...base, sealNo: "X".repeat(31) })).toThrow(/30 karakter/);
  });
});
