import { describe, expect, it } from "vitest";
import {
  cbmFromDims, computeChargeable, kgPerCbm, quoteDomestic, roundUp, sumPackages, volumetricKgFromCbm,
} from "@/lib/chargeable";

const AIR = { divisor: 6000, minChargeableKg: 0, roundingKg: 0.5 };
const LCL = { divisor: 1000, minChargeableKg: 1000, roundingKg: 1 };
const DARAT = { divisor: 4000, minChargeableKg: 10, roundingKg: 1 };

describe("chargeable weight", () => {
  it("dimensi → CBM", () => {
    expect(cbmFromDims(100, 50, 40)).toBe(0.2);
    expect(cbmFromDims(100, 50, 40, 3)).toBe(0.6);
  });

  it("divisor → berat volumetrik & kg/CBM", () => {
    expect(volumetricKgFromCbm(1, 6000)).toBe(166.67);
    expect(volumetricKgFromCbm(1, 4000)).toBe(250);
    expect(kgPerCbm(1000)).toBe(1000);
  });

  it("udara: volume lebih besar dari berat aktual → pakai volumetrik, bulat ke 0,5 kg", () => {
    const r = computeChargeable({ actualKg: 120, volumeCbm: 1 }, AIR);
    expect(r.volumetricKg).toBe(166.67);
    expect(r.basis).toBe("VOLUME");
    expect(r.chargeableKg).toBe(167);
  });

  it("udara: berat aktual lebih besar → pakai aktual", () => {
    const r = computeChargeable({ actualKg: 250.2, volumeCbm: 1 }, AIR);
    expect(r.basis).toBe("ACTUAL");
    expect(r.chargeableKg).toBe(250.5);
  });

  it("LCL W/M: minimum 1 RT berlaku", () => {
    const r = computeChargeable({ actualKg: 300, volumeCbm: 0.5 }, LCL);
    expect(r.basis).toBe("MINIMUM");
    expect(r.chargeableKg).toBe(1000);
  });

  it("minimum tarif bisa lebih tinggi dari minimum aturan", () => {
    const r = computeChargeable({ actualKg: 5, volumeCbm: 0.01 }, DARAT, 30);
    expect(r.chargeableKg).toBe(30);
  });

  it("tanpa barang → 0", () => {
    expect(computeChargeable({ actualKg: 0, volumeCbm: 0 }, DARAT).chargeableKg).toBe(0);
  });

  it("kardus besar tapi ringan → ditagih berat volume (seperti kurir)", () => {
    // 60×50×50 cm, 3 kg, ÷6000 → 25 kg
    const r = computeChargeable({ actualKg: 3, volumeCbm: cbmFromDims(60, 50, 50) }, { divisor: 6000, minChargeableKg: 1, roundingKg: 1 });
    expect(r.volumetricKg).toBe(25);
    expect(r.basis).toBe("VOLUME");
    expect(r.chargeableKg).toBe(25);
  });

  it("volume minimum: kiriman kecil tetap ditagih min CBM", () => {
    const r = computeChargeable({ actualKg: 20, volumeCbm: 0.1 }, { divisor: 4000, minChargeableKg: 0, roundingKg: 1, minVolumeCbm: 0.5 });
    expect(r.chargedCbm).toBe(0.5);
    expect(r.basis).toBe("MIN_VOLUME");
    expect(r.chargeableKg).toBe(125); // 0,5 CBM × 250 kg
  });

  it("toleransi pembulatan: sisa ≤ toleransi dibulatkan ke bawah", () => {
    const rule = { divisor: 6000, minChargeableKg: 1, roundingKg: 1, roundingToleranceKg: 0.3 };
    expect(computeChargeable({ actualKg: 1.3, volumeCbm: 0 }, rule).chargeableKg).toBe(1);
    expect(computeChargeable({ actualKg: 1.31, volumeCbm: 0 }, rule).chargeableKg).toBe(2);
    // tidak boleh turun di bawah minimum
    expect(computeChargeable({ actualKg: 0.2, volumeCbm: 0 }, rule).chargeableKg).toBe(1);
  });

  it("pembulatan ke atas", () => {
    expect(roundUp(10.01, 1)).toBe(11);
    expect(roundUp(10, 1)).toBe(10);
    expect(roundUp(10.2, 0.5)).toBe(10.5);
  });
});

describe("domestik", () => {
  // contoh: videotron 2 koli, peti kayu 200×40×150 cm, 85 kg per koli
  const packages = [{ qty: 2, lengthCm: 200, widthCm: 40, heightCm: 150, weightKg: 85 }];

  it("jumlahkan koli", () => {
    expect(sumPackages(packages)).toEqual({ totalKoli: 2, actualKg: 170, volumeCbm: 2.4 });
  });

  it("harga = berat kena biaya × tarif + packing + asuransi", () => {
    const q = quoteDomestic({
      packages, rule: DARAT, ratePerKg: 3500, declaredValue: 50_000_000, insurancePct: 0.2, packing: 750_000,
    });
    expect(q.volumetricKg).toBe(600); // 2,4 CBM × 1.000.000 / 4000
    expect(q.chargeableKg).toBe(600);
    expect(q.freight).toBe(2_100_000);
    expect(q.insurance).toBe(100_000);
    expect(q.total).toBe(2_950_000);
  });
});
