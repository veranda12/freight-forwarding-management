import { describe, it, expect } from "vitest";
import { modeDirKey, JOB_STATUS_FLOW, MODE_SHORT, isBackwardStatus } from "@/lib/enums";

describe("enums", () => {
  it("modeDirKey membentuk key sequence yang benar", () => {
    expect(modeDirKey("SEA_FCL", "EXPORT")).toBe("SEA-EXP");
    expect(modeDirKey("SEA_LCL", "IMPORT")).toBe("SEA-IMP");
    expect(modeDirKey("AIR", "EXPORT")).toBe("AIR-EXP");
    expect(modeDirKey("LAND", "EXPORT")).toBe("LAND-EXP");
    expect(modeDirKey("CUSTOMS", "IMPORT")).toBe("CC-IMP");
  });

  it("alur status job berurutan Draft → Closed", () => {
    expect(JOB_STATUS_FLOW[0]).toBe("DRAFT");
    expect(JOB_STATUS_FLOW[JOB_STATUS_FLOW.length - 1]).toBe("CLOSED");
    expect(JOB_STATUS_FLOW).not.toContain("CANCELLED");
  });

  it("MODE_SHORT lengkap", () => {
    expect(MODE_SHORT.SEA_FCL).toBe("FCL");
    expect(MODE_SHORT.AIR).toBe("AIR");
  });
});

describe("isBackwardStatus", () => {
  it("menolak mundur, mengizinkan maju dan lompat", () => {
    expect(isBackwardStatus("DEPARTED", "STUFFING")).toBe(true);
    expect(isBackwardStatus("DELIVERED", "DRAFT")).toBe(true);
    expect(isBackwardStatus("DEPARTED", "IN_TRANSIT")).toBe(false);
    expect(isBackwardStatus("BOOKED", "DELIVERED")).toBe(false);
    expect(isBackwardStatus("ARRIVED", "ARRIVED")).toBe(false);
    expect(isBackwardStatus("ARRIVED", "CANCELLED")).toBe(false);
  });
});
