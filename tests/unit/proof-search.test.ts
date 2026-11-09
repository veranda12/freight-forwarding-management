import { describe, it, expect } from "vitest";
import { parseIdAmount, parseProofFilter, parseProofQuery, proofKindsFor } from "@/lib/proof-search";

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
    "JOB/SEA-IMP/2026", "2026/11", "SLG/BM/26/11/001", "SLG/BK/26/11/06/0258", "abc", "1.25.000", "1.2345", "1.250.000,505",
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

describe("parseProofFilter", () => {
  it("tanpa kata kunci dan tanpa periode → null", () => {
    expect(parseProofFilter({})).toBeNull();
    expect(parseProofFilter({ q: "a", kind: "bill" })).toBeNull();
  });
  it("periode saja sudah cukup", () => {
    expect(parseProofFilter({ from: "2026-11-01", to: "2026-11-30" })).toEqual({ query: null, from: "2026-11-01", to: "2026-11-30", kind: null });
    expect(parseProofFilter({ to: "2026-11-30" })?.from).toBeNull();
  });
  it("tanggal terbalik ditukar, tanggal & jenis tidak sah diabaikan", () => {
    expect(parseProofFilter({ from: "2026-11-30", to: "2026-11-01" })).toMatchObject({ from: "2026-11-01", to: "2026-11-30" });
    expect(parseProofFilter({ q: "BK/26", from: "30/11/2026", kind: "xx" })).toMatchObject({ from: null, kind: null });
  });
  it("kata kunci + periode + jenis", () => {
    const f = parseProofFilter({ q: "BK/26/11", from: "2026-11-01", kind: "payment" });
    expect(f?.query?.text).toBe("BK/26/11");
    expect(f).toMatchObject({ from: "2026-11-01", to: null, kind: "payment" });
  });
});

describe("proofKindsFor — jenis bukti mengikuti izin modul", () => {
  it("FINANCE, ADMIN, MANAGEMENT melihat semua jenis", () => {
    for (const r of ["FINANCE", "ADMIN", "MANAGEMENT"] as const) expect(proofKindsFor(r)).toHaveLength(7);
  });
  it("SALES hanya invoice", () => {
    expect(proofKindsFor("SALES")).toEqual(["invoice"]);
  });
  it("OPERATION tidak mendapat apa pun", () => {
    expect(proofKindsFor("OPERATION")).toEqual([]);
  });
});
