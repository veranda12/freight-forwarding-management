import { describe, it, expect } from "vitest";
import { validateVehicleInput } from "@/lib/vehicles";

const base = { code: "trk-01", plate: "b 9123 cd", type: "Truk box 4 ton" };

describe("validateVehicleInput", () => {
  it("normalisasi kode dan plat ke huruf besar", () => {
    const v = validateVehicleInput(base);
    expect(v.code).toBe("TRK-01");
    expect(v.plate).toBe("B 9123 CD");
    expect(v.isActive).toBe(true);
  });

  it("menolak kode yang mengandung spasi atau simbol", () => {
    expect(() => validateVehicleInput({ ...base, code: "TRK 01" })).toThrow(/Kode armada/);
    expect(() => validateVehicleInput({ ...base, code: "A" })).toThrow(/Kode armada/);
  });

  it("menolak plat yang tidak sesuai format nomor polisi", () => {
    expect(() => validateVehicleInput({ ...base, plate: "NOPOL" })).toThrow(/Nomor polisi/);
    expect(() => validateVehicleInput({ ...base, plate: "12345" })).toThrow(/Nomor polisi/);
  });

  it("menerima plat tanpa spasi dan kapasitas kosong menjadi null", () => {
    const v = validateVehicleInput({ ...base, plate: "B9123CD", capacityKg: null, capacityCbm: undefined });
    expect(v.plate).toBe("B9123CD");
    expect(v.capacityKg).toBeNull();
    expect(v.capacityCbm).toBeNull();
  });

  it("menolak jenis kosong dan kapasitas negatif", () => {
    expect(() => validateVehicleInput({ ...base, type: " " })).toThrow(/Jenis armada/);
    expect(() => validateVehicleInput({ ...base, capacityKg: -1 })).toThrow(/tidak boleh negatif/);
  });
});
