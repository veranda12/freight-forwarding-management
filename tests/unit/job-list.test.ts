import { describe, expect, it } from "vitest";
import { blOf, invoiceNumbersOf, jobListQuery, jobListWhere, parseJobListFilter, todayJakarta } from "@/lib/job-list";

// 10 Nov 2026 pukul 23.30 WIB = 16.30 UTC
const NOW = new Date("2026-11-10T16:30:00Z");

describe("parseJobListFilter", () => {
  it("tanpa pencarian: hanya hari ini menurut WIB", () => {
    expect(parseJobListFilter({}, NOW)).toEqual({ by: "today", from: "2026-11-10", to: "2026-11-10" });
    // 00.30 WIB 11 Nov masih 10 Nov di UTC
    expect(todayJakarta(new Date("2026-11-10T17:30:00Z"))).toBe("2026-11-11");
  });

  it("No. Job dan B/L memakai kata kunci, kosong kembali ke hari ini", () => {
    expect(parseJobListFilter({ by: "job", q: "  JOB/SEA " }, NOW)).toEqual({ by: "job", q: "JOB/SEA" });
    expect(parseJobListFilter({ by: "bl", q: "SLLY49" }, NOW)).toEqual({ by: "bl", q: "SLLY49" });
    expect(parseJobListFilter({ by: "job", q: "   " }, NOW).by).toBe("today");
  });

  it("periode: tukar bila terbalik, isi sisi yang kosong, abaikan format salah", () => {
    expect(parseJobListFilter({ by: "period", from: "2026-11-10", to: "2026-11-01" }, NOW)).toEqual({ by: "period", from: "2026-11-01", to: "2026-11-10" });
    expect(parseJobListFilter({ by: "period", from: "2026-11-05" }, NOW)).toEqual({ by: "period", from: "2026-11-05", to: "2026-11-05" });
    expect(parseJobListFilter({ by: "period", from: "10/11/2026" }, NOW).by).toBe("today");
    expect(parseJobListFilter({ by: "lain", q: "x" }, NOW).by).toBe("today");
  });
});

describe("jobListWhere", () => {
  it("rentang tanggal dibuat dalam WIB", () => {
    expect(jobListWhere({ by: "today", from: "2026-11-10", to: "2026-11-10" })).toEqual({
      openedAt: { gte: new Date("2026-11-09T17:00:00Z"), lte: new Date("2026-11-10T16:59:59.999Z") },
    });
  });

  it("B/L mencari House dan Master, laut dan udara", () => {
    const w = jobListWhere({ by: "bl", q: "abc" }) as any;
    expect(w.OR.map((o: any) => Object.keys(o)[0]).sort()).toEqual(["hawbNo", "hblNo", "mawbNo", "mblNo"]);
    expect(jobListWhere({ by: "job", q: "0011" })).toEqual({ number: { contains: "0011", mode: "insensitive" } });
  });
});

describe("kolom daftar job", () => {
  it("B/L: House lebih dulu, lalu Master", () => {
    expect(blOf({ hblNo: "H1", mblNo: "M1", hawbNo: null, mawbNo: null })).toBe("H1");
    expect(blOf({ hblNo: null, mblNo: "M1", hawbNo: null, mawbNo: null })).toBe("M1");
    expect(blOf({ hblNo: null, mblNo: null, hawbNo: null, mawbNo: "157-1" })).toBe("157-1");
    expect(blOf({ hblNo: null, mblNo: null, hawbNo: null, mawbNo: null })).toBe("");
  });

  it("invoice batal tidak dihitung", () => {
    expect(invoiceNumbersOf([{ number: "INV/1", status: "PAID" }, { number: "INV/2", status: "CANCELLED" }, { number: "INV/3", status: "UNPAID" }])).toBe("INV/1, INV/3");
    expect(invoiceNumbersOf([{ number: "INV/2", status: "CANCELLED" }])).toBe("");
  });

  it("query export sama dengan filter", () => {
    expect(jobListQuery({ by: "today", from: "2026-11-10", to: "2026-11-10" })).toBe("");
    expect(jobListQuery({ by: "period", from: "2026-11-01", to: "2026-11-10" })).toBe("by=period&from=2026-11-01&to=2026-11-10");
    expect(jobListQuery({ by: "bl", q: "A B" })).toBe("by=bl&q=A+B");
  });
});
