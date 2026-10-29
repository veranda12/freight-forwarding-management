import { describe, expect, it } from "vitest";
import { resolveBuyingSource, sourceLabel } from "@/lib/quote-source";

describe("resolveBuyingSource", () => {
  it("vendor: menyimpan vendor dan mengabaikan armada", () => {
    expect(resolveBuyingSource({ costSource: "VENDOR", vendorId: "v1", vehicleId: "a1" })).toEqual({ costSource: "VENDOR", vendorId: "v1", vehicleId: null });
  });

  it("vendor kosong tetap valid (belum ditentukan)", () => {
    expect(resolveBuyingSource({ costSource: "VENDOR", vendorId: "" })).toEqual({ costSource: "VENDOR", vendorId: null, vehicleId: null });
  });

  it("armada sendiri: menyimpan armada dan mengabaikan vendor", () => {
    expect(resolveBuyingSource({ costSource: "OWN_FLEET", vendorId: "v1", vehicleId: "a1" })).toEqual({ costSource: "OWN_FLEET", vendorId: null, vehicleId: "a1" });
  });

  it("nilai sumber tidak dikenal dianggap vendor", () => {
    expect(resolveBuyingSource({ costSource: "X" }).costSource).toBe("VENDOR");
  });

  it("label menampilkan plat untuk armada sendiri", () => {
    expect(sourceLabel({ plate: "B 1234 ABC" })).toBe("Armada B 1234 ABC");
    expect(sourceLabel({ vendorName: "PT Trans Jaya" })).toBe("PT Trans Jaya");
  });
});
