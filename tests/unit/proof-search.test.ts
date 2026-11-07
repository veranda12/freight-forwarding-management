import { describe, it, expect } from "vitest";
import { parseIdAmount, parseProofQuery, proofKindsFor } from "@/lib/proof-search";
import { ALL_PERMISSION_KEYS, DEFAULT_ROLES, normalizePermissions } from "@/lib/permissions";

describe("parseIdAmount — nominal format Indonesia", () => {
  it.each([
    ["1.250.000", 1_250_000],
    ["1250000", 1_250_000],
    ["Rp 1.250.000", 1_250_000],
    ["rp1.250.000", 1_250_000],
    ["IDR 1.250.000,50", 1_250_000.5],
    ["1.250.000,50", 1_250_000.5],
    ["1250000,5", 1_250_000.5],
    ["1.250", 1250],
    ["12,5", 12.5],
    ["1,250,000.50", 1_250_000.5],
    ["92.950", 92_950],
  ])("%s → %d", (s, n) => expect(parseIdAmount(s)).toBe(n));

  it.each([
    "JOB/SEA-IMP/2026", "2026/11", "SLG/BM/26/11/001", "abc", "1.25.000", "1.2345", "1.250.000,505",
    "1.250.", "0", "001", "1,250.000,50", "",
  ])("%s → bukan nominal", (s) => expect(parseIdAmount(s)).toBeNull());
});

describe("parseProofQuery", () => {
  it("menolak kata kunci terlalu pendek", () => {
    expect(parseProofQuery(" a ")).toBeNull();
    expect(parseProofQuery(undefined)).toBeNull();
  });
  it("memecah kata dan mengenali nominal", () => {
    expect(parseProofQuery("  Maersk   2026/11 ")).toEqual({ text: "Maersk 2026/11", terms: ["Maersk", "2026/11"], amount: null });
    expect(parseProofQuery("Rp 1.250.000,50")?.amount).toBe(1_250_000.5);
  });
  it("maksimal 6 kata", () => {
    expect(parseProofQuery("a1 b2 c3 d4 e5 f6 g7 h8")?.terms).toHaveLength(6);
  });
});

describe("proofKindsFor — jenis bukti mengikuti izin modul (role bawaan katalog)", () => {
  const userOf = (key: string) => {
    if (key === "ADMIN") return { id: "u", isAdmin: true, permissions: new Set(ALL_PERMISSION_KEYS) };
    const role = DEFAULT_ROLES.find((r) => r.key === key)!;
    return { id: "u", isAdmin: false, permissions: new Set(normalizePermissions(role.permissions)) };
  };
  it("FINANCE, ADMIN, MANAGEMENT melihat semua jenis", () => {
    for (const r of ["FINANCE", "ADMIN", "MANAGEMENT"]) expect(proofKindsFor(userOf(r))).toHaveLength(7);
  });
  it("SALES hanya invoice", () => {
    expect(proofKindsFor(userOf("SALES"))).toEqual(["invoice"]);
  });
  it("OPERATION dan DOCUMENTATION tidak mendapat apa pun", () => {
    expect(proofKindsFor(userOf("OPERATION"))).toEqual([]);
    expect(proofKindsFor(userOf("DOCUMENTATION"))).toEqual([]);
  });
  it("tanpa login tidak mendapat apa pun", () => {
    expect(proofKindsFor(null)).toEqual([]);
  });
  it("jurnal cukup dengan Kasir All, tanpa accounting.view", () => {
    expect(proofKindsFor({ isAdmin: false, permissions: new Set(["kasir.view" as const]) })).toEqual(["journal"]);
  });
});
