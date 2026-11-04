/** Parser CSV rekening koran. Murni (tanpa database), dipakai di browser untuk pratinjau dan di server untuk validasi. */

export type ParsedRow = { date: string; description: string; amount: number; balance: number | null; reference: string | null };
export type ParseResult = { rows: ParsedRow[]; errors: string[]; columns: Record<string, string> };

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, mei: 5, may: 5, jun: 6, jul: 7, agu: 8, agt: 8, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, des: 12, dec: 12,
};

/** Pecah CSV menjadi baris dan kolom. Mendukung kutip ganda dan pemisah koma, titik koma, atau tab. */
export function splitCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const firstLines = clean.split("\n").slice(0, 20).join("\n");
  const count = (ch: string) => (firstLines.match(new RegExp(ch === "\t" ? "\\t" : `\\${ch}`, "g")) ?? []).length;
  const sep = [",", ";", "\t"].sort((a, b) => count(b) - count(a))[0];
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(cell.trim()); cell = ""; }
    else if (ch === "\n") { row.push(cell.trim()); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell.length || row.length) { row.push(cell.trim()); rows.push(row); }
  return rows.filter((r) => r.some((c) => c !== ""));
}

/** Angka dengan format Indonesia atau Inggris, tanda minus, kurung, atau akhiran CR/DB/D/K. */
export function parseAmount(raw: string): number | null {
  let s = (raw ?? "").trim().toUpperCase();
  if (!s) return null;
  let sign = 1;
  if (/^\(.*\)$/.test(s)) { sign = -1; s = s.slice(1, -1); }
  const suffix = s.match(/\s*(CR|DB|DR|D|K|C)\.?$/);
  if (suffix) { sign = suffix[1] === "DB" || suffix[1] === "DR" || suffix[1] === "D" ? -1 : 1; s = s.slice(0, suffix.index).trim(); }
  s = s.replace(/^(IDR|RP\.?|USD|SGD|EUR)\s*/, "").replace(/\s/g, "");
  if (s.startsWith("-")) { sign = -sign; s = s.slice(1); }
  if (s.startsWith("+")) s = s.slice(1);
  if (!/^[0-9.,]+$/.test(s)) return null;
  const lastDot = s.lastIndexOf("."), lastComma = s.lastIndexOf(",");
  let normalized: string;
  if (lastDot >= 0 && lastComma >= 0) {
    normalized = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    normalized = /,\d{1,2}$/.test(s) ? s.replace(/,(?=\d{3}(\D|$))/g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastDot >= 0) {
    normalized = /\.\d{1,2}$/.test(s) && (s.match(/\./g) ?? []).length === 1 ? s : s.replace(/\./g, "");
  } else normalized = s;
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(sign * n * 100) / 100 : null;
}

/** Tanggal: yyyy-mm-dd, dd/mm/yyyy, dd-mm-yy, atau dd MMM yyyy (Indonesia/Inggris). */
export function parseDate(raw: string): string | null {
  const s = (raw ?? "").trim();
  const pad = (n: number) => String(n).padStart(2, "0");
  const valid = (y: number, m: number, d: number) => {
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
  };
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) { const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; return valid(y, +m[2], +m[1]); }
  m = s.match(/^(\d{1,2})[\s-]+([A-Za-z]{3})[A-Za-z]*[\s-]+(\d{2,4})/);
  if (m) { const mon = MONTHS[m[2].toLowerCase()]; const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; return mon ? valid(y, mon, +m[1]) : null; }
  return null;
}

const KEYS: Record<string, string[]> = {
  date: ["tanggal transaksi", "tgl transaksi", "transaction date", "posting date", "tanggal", "tgl", "date"],
  description: ["keterangan", "deskripsi", "description", "uraian", "remarks", "remark", "narrative"],
  debit: ["mutasi debet", "mutasi debit", "debit", "debet", "withdrawal", "withdrawals", "keluar", "db"],
  credit: ["mutasi kredit", "kredit", "credit", "deposit", "deposits", "masuk", "cr"],
  amount: ["jumlah", "amount", "nominal", "mutasi", "nilai"],
  indicator: ["d/k", "db/cr", "dk", "tipe", "type", "jenis"],
  balance: ["saldo akhir", "saldo", "balance", "running balance"],
  reference: ["no. referensi", "no referensi", "referensi", "reference", "no ref", "ref"],
};

function mapHeader(header: string[]) {
  const norm = header.map((h) => h.toLowerCase().replace(/\s+/g, " ").trim());
  const used = new Set<number>();
  const idx: Record<string, number> = {};
  for (const pass of ["exact", "includes"] as const) {
    for (const [key, words] of Object.entries(KEYS)) {
      if (idx[key] !== undefined) continue;
      for (const w of words) {
        const i = norm.findIndex((h, j) => !used.has(j) && (pass === "exact" ? h === w : h.includes(w)));
        if (i >= 0) { idx[key] = i; used.add(i); break; }
      }
    }
  }
  return idx;
}

/** Baca CSV rekening koran menjadi mutasi bertanda: + uang masuk, - uang keluar. */
export function parseStatementCsv(text: string): ParseResult {
  const table = splitCsv(text);
  const errors: string[] = [];
  // Header bisa didahului baris info (no. rekening, periode); cari baris yang punya kolom tanggal dan nominal.
  let headerAt = -1, idx: Record<string, number> = {};
  for (let i = 0; i < Math.min(table.length, 20); i++) {
    const m = mapHeader(table[i]);
    if (m.date !== undefined && (m.amount !== undefined || m.debit !== undefined || m.credit !== undefined)) { headerAt = i; idx = m; break; }
  }
  if (headerAt < 0) return { rows: [], errors: ["Header tidak ditemukan. File harus punya kolom tanggal dan kolom nominal (jumlah, atau debit dan kredit)."], columns: {} };
  const header = table[headerAt];
  const columns = Object.fromEntries(Object.entries(idx).map(([k, i]) => [k, header[i]]));
  if (idx.description === undefined) errors.push("Kolom keterangan tidak ditemukan; keterangan diisi '-'.");

  const rows: ParsedRow[] = [];
  table.slice(headerAt + 1).forEach((r, n) => {
    const line = headerAt + n + 2;
    const rawDate = r[idx.date] ?? "";
    const desc = idx.description !== undefined ? (r[idx.description] ?? "").trim() : "-";
    const date = parseDate(rawDate);
    if (!date) {
      if (/saldo|total|mutasi|opening|closing|balance/i.test(`${rawDate} ${desc}`) || !rawDate) return; // baris ringkasan
      errors.push(`Baris ${line}: tanggal "${rawDate}" tidak dikenali.`);
      return;
    }
    let amount: number | null = null;
    if (idx.debit !== undefined || idx.credit !== undefined) {
      const d = idx.debit !== undefined ? Math.abs(parseAmount(r[idx.debit] ?? "") ?? 0) : 0;
      const c = idx.credit !== undefined ? Math.abs(parseAmount(r[idx.credit] ?? "") ?? 0) : 0;
      amount = Math.round((c - d) * 100) / 100;
    } else {
      amount = parseAmount(r[idx.amount] ?? "");
      const ind = idx.indicator !== undefined ? (r[idx.indicator] ?? "").trim().toUpperCase() : "";
      if (amount !== null && ind) amount = /^(D|DB|DR|DEBIT|DEBET)$/.test(ind) ? -Math.abs(amount) : /^(K|CR|C|KREDIT|CREDIT)$/.test(ind) ? Math.abs(amount) : amount;
    }
    if (amount === null || amount === 0) {
      if (/saldo|total|opening|closing|balance/i.test(desc)) return; // baris saldo awal/akhir
      errors.push(`Baris ${line}: nominal tidak valid atau nol.`);
      return;
    }
    rows.push({
      date, description: desc || "-", amount,
      balance: idx.balance !== undefined ? parseAmount(r[idx.balance] ?? "") : null,
      reference: idx.reference !== undefined ? (r[idx.reference] ?? "").trim() || null : null,
    });
  });
  return { rows, errors, columns };
}
