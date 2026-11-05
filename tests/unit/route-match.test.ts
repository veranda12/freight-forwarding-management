import { describe, it, expect } from "vitest";
import { parseRouteText } from "@/lib/route-match";

describe("parseRouteText (D-08)", () => {
  it("memisahkan label dan kode dalam kurung", () => {
    expect(parseRouteText("Jakarta (IDTPP)")).toEqual({ label: "Jakarta", code: "IDTPP" });
    expect(parseRouteText("Los Angeles (USLAX)")).toEqual({ label: "Los Angeles", code: "USLAX" });
    expect(parseRouteText("  Jakarta ( cgk ) ")).toEqual({ label: "Jakarta", code: "CGK" });
  });

  it("teks tanpa kode menjadi label saja", () => {
    expect(parseRouteText("Shanghai")).toEqual({ label: "Shanghai", code: null });
    expect(parseRouteText("Jakarta (Tanjung Priok)")).toEqual({ label: "Jakarta (Tanjung Priok)", code: null });
  });

  it("kosong atau null menghasilkan null", () => {
    expect(parseRouteText("")).toBeNull();
    expect(parseRouteText("   ")).toBeNull();
    expect(parseRouteText(null)).toBeNull();
    expect(parseRouteText(undefined)).toBeNull();
  });
});
