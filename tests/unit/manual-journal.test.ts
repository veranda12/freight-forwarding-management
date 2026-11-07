import { describe, it, expect } from "vitest";
import { validateManualJournal, isDateKey, MAX_LINES, type AccountInfo } from "../../src/lib/manual-journal";

const acc = (code: string, extra: Partial<AccountInfo> = {}): AccountInfo => ({ code, name: `Akun ${code}`, isPostable: true, isActive: true, blockedReason: null, ...extra });
const ACCOUNTS = new Map<string, AccountInfo>([
  ["kas", acc("1100")],
  ["gaji", acc("6100")],
  ["listrik", acc("6310")],
  ["umum", acc("6300")],
  ["ppn", acc("2100")],
  ["header", acc("6000", { isPostable: false })],
  ["mati", acc("6999", { isActive: false })],
  ["ar", acc("1300", { blockedReason: "adalah piutang usaha." })],
]);
const base = { dateKey: "2026-10-30", description: "Koreksi salah akun" };
const v = (lines: { accountId: string; debit?: number | string | null; credit?: number | string | null; description?: string }[], over: Partial<typeof base> = {}) =>
  validateManualJournal({ ...base, ...over, lines }, ACCOUNTS);

describe("validateManualJournal: jurnal yang sah", () => {
  it("menerima jurnal dua baris yang seimbang", () => {
    const r = v([{ accountId: "listrik", debit: 500000 }, { accountId: "umum", credit: 500000 }]);
    expect(r.total).toBe(500000);
    expect(r.lines).toHaveLength(2);
    expect(r.description).toBe("Koreksi salah akun");
  });
  it("menerima banyak baris dengan desimal tanpa galat pembulatan (0,10 + 0,20 = 0,30)", () => {
    const r = v([{ accountId: "listrik", debit: 0.1 }, { accountId: "gaji", debit: 0.2 }, { accountId: "kas", credit: 0.3 }]);
    expect(r.total).toBe(0.3);
  });
  it("menerima nominal dalam bentuk teks dan nilai besar sampai sen", () => {
    const r = v([{ accountId: "gaji", debit: "12345678901.23" }, { accountId: "kas", credit: "12345678901.23" }]);
    expect(r.total).toBe(12345678901.23);
  });
  it("mengabaikan baris kosong dari form", () => {
    const r = v([{ accountId: "listrik", debit: 100 }, { accountId: "", debit: "", credit: "" }, { accountId: "kas", credit: 100 }]);
    expect(r.lines).toHaveLength(2);
  });
  it("boleh ke akun pajak, karena koreksi PPN termasuk kasus jurnal umum", () => {
    expect(() => v([{ accountId: "ppn", debit: 1000 }, { accountId: "umum", credit: 1000 }])).not.toThrow();
  });
  it("memangkas keterangan dan referensi", () => {
    const r = validateManualJournal({ dateKey: "2026-10-30", description: "  Koreksi  ", reference: "  ", lines: [{ accountId: "gaji", debit: 1 }, { accountId: "kas", credit: 1 }] }, ACCOUNTS);
    expect(r.description).toBe("Koreksi");
    expect(r.reference).toBeNull();
  });
});

describe("validateManualJournal: jurnal yang ditolak", () => {
  it("menolak jurnal yang tidak seimbang dan menyebut selisihnya", () => {
    expect(() => v([{ accountId: "listrik", debit: 500000 }, { accountId: "kas", credit: 499999.99 }])).toThrow(/belum seimbang.*selisih 0.01/);
  });
  it("menolak kurang dari dua baris", () => {
    expect(() => v([{ accountId: "listrik", debit: 1 }])).toThrow(/minimal 2 baris/);
  });
  it(`menolak lebih dari ${MAX_LINES} baris`, () => {
    const lines = Array.from({ length: MAX_LINES + 1 }, (_, i) => (i === 0 ? { accountId: "kas", credit: MAX_LINES } : { accountId: "gaji", debit: 1 }));
    expect(() => v(lines)).toThrow(/maksimal/);
  });
  it("menolak baris yang berisi debit dan kredit sekaligus", () => {
    expect(() => v([{ accountId: "listrik", debit: 10, credit: 10 }, { accountId: "kas", credit: 0 }])).toThrow(/tidak keduanya/);
  });
  it("menolak baris berakun tanpa nominal", () => {
    expect(() => v([{ accountId: "listrik", debit: 10 }, { accountId: "kas" }, { accountId: "umum", credit: 10 }])).toThrow(/Baris 2: nominal/);
  });
  it("menolak nominal negatif", () => {
    expect(() => v([{ accountId: "listrik", debit: -10 }, { accountId: "kas", credit: -10 }])).toThrow(/negatif/);
  });
  it("menolak lebih dari dua angka desimal", () => {
    expect(() => v([{ accountId: "listrik", debit: 10.005 }, { accountId: "kas", credit: 10.005 }])).toThrow(/2 angka desimal/);
  });
  it("menolak nominal bukan angka", () => {
    expect(() => v([{ accountId: "listrik", debit: "abc" }, { accountId: "kas", credit: 1 }])).toThrow(/tidak valid/);
  });
  it("menolak jurnal yang hanya berisi debit", () => {
    expect(() => v([{ accountId: "listrik", debit: 10 }, { accountId: "gaji", debit: 10 }])).toThrow(/satu baris debit dan satu baris kredit/);
  });
  it("menolak baris bernominal tanpa akun", () => {
    expect(() => v([{ accountId: "", debit: 10 }, { accountId: "kas", credit: 10 }])).toThrow(/Baris 1: pilih akun/);
  });
  it("menolak akun yang tidak dikenal", () => {
    expect(() => v([{ accountId: "hilang", debit: 10 }, { accountId: "kas", credit: 10 }])).toThrow(/tidak ditemukan/);
  });
  it("menolak akun header, akun nonaktif, dan akun yang diblokir", () => {
    expect(() => v([{ accountId: "header", debit: 10 }, { accountId: "kas", credit: 10 }])).toThrow(/akun header/);
    expect(() => v([{ accountId: "mati", debit: 10 }, { accountId: "kas", credit: 10 }])).toThrow(/tidak aktif/);
    expect(() => v([{ accountId: "ar", debit: 10 }, { accountId: "kas", credit: 10 }])).toThrow(/piutang usaha/);
  });
  it("menolak keterangan kosong atau terlalu pendek", () => {
    expect(() => v([{ accountId: "gaji", debit: 1 }, { accountId: "kas", credit: 1 }], { description: " a " })).toThrow(/Keterangan/);
  });
  it("menolak tanggal yang tidak ada di kalender", () => {
    expect(() => v([{ accountId: "gaji", debit: 1 }, { accountId: "kas", credit: 1 }], { dateKey: "2026-02-30" })).toThrow(/Tanggal/);
    expect(() => v([{ accountId: "gaji", debit: 1 }, { accountId: "kas", credit: 1 }], { dateKey: "30/10/2026" })).toThrow(/Tanggal/);
  });
});

describe("isDateKey", () => {
  it("menerima tanggal valid termasuk 29 Februari tahun kabisat", () => {
    expect(isDateKey("2026-10-30")).toBe(true);
    expect(isDateKey("2028-02-29")).toBe(true);
  });
  it("menolak tanggal yang tidak ada dan format lain", () => {
    expect(isDateKey("2026-02-29")).toBe(false);
    expect(isDateKey("2026-13-01")).toBe(false);
    expect(isDateKey("2026-1-1")).toBe(false);
    expect(isDateKey(undefined)).toBe(false);
  });
});
