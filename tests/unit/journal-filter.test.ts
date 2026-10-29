import { describe, it, expect } from "vitest";
import { parseJournalFilter, journalFilterToQuery, quickRange, DEFAULT_FILTER } from "@/lib/journal-filter";

const parse = (q: string) => parseJournalFilter(new URLSearchParams(q));

describe("parseJournalFilter", () => {
  it("query kosong menghasilkan filter default", () => {
    expect(parse("")).toEqual({ ...DEFAULT_FILTER, from: undefined, to: undefined, q: undefined, account: undefined, min: undefined, max: undefined });
  });

  it("membaca semua filter yang valid", () => {
    const f = parse("from=2026-01-01&to=2026-03-31&q=gaji&source=MANUAL&source=BILL&account=6100&side=debit&min=100&max=500&status=normal&sort=date_asc&page=2&limit=50");
    expect(f).toMatchObject({ from: "2026-01-01", to: "2026-03-31", q: "gaji", sources: ["MANUAL", "BILL"], account: "6100", side: "debit", min: 100, max: 500, status: "normal", sort: "date_asc", page: 2, limit: 50 });
  });

  it("mengabaikan nilai tidak valid", () => {
    const f = parse("from=kemarin&source=HACK&account=abc&side=debit&min=-5&status=x&sort=y&page=-3&limit=7");
    expect(f.from).toBeUndefined();
    expect(f.sources).toEqual([]);
    expect(f.account).toBeUndefined();
    expect(f.side).toBe("all"); // posisi hanya berlaku jika akun dipilih
    expect(f.min).toBeUndefined();
    expect(f).toMatchObject({ status: "all", sort: "date_desc", page: 1, limit: 25 });
  });

  it("menukar rentang yang terbalik", () => {
    expect(parse("from=2026-12-01&to=2026-01-01")).toMatchObject({ from: "2026-01-01", to: "2026-12-01" });
    expect(parse("min=900&max=100")).toMatchObject({ min: 100, max: 900 });
  });

  it("toQuery lalu parse menghasilkan filter yang sama", () => {
    const f = parse("from=2026-01-01&q=JE/2026&source=RECEIPT&account=1200&side=credit&max=1000&page=3&limit=100");
    expect(parseJournalFilter(new URLSearchParams(journalFilterToQuery(f)))).toEqual(f);
  });
});

describe("quickRange", () => {
  const today = new Date("2026-10-29T05:00:00Z");
  it("menghitung bulan ini, bulan lalu, dan tahun", () => {
    expect(quickRange("this_month", today)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(quickRange("last_month", today)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(quickRange("this_year", today)).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(quickRange("last_year", today)).toEqual({ from: "2025-01-01", to: "2025-12-31" });
  });
});
