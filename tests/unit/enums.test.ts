import { describe, it, expect } from "vitest";
import { modeDirKey, JOB_STATUS_FLOW, MODE_SHORT } from "@/lib/enums";

describe("enums", () => {
  it("modeDirKey membentuk key sequence yang benar", () => {
    expect(modeDirKey("SEA_FCL", "EXPORT")).toBe("SEA-EXP");
    expect(modeDirKey("SEA_LCL", "IMPORT")).toBe("SEA-IMP");
    expect(modeDirKey("AIR", "EXPORT")).toBe("AIR-EXP");
    expect(modeDirKey("LAND", "DOMESTIC")).toBe("LAND-DOM");
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
