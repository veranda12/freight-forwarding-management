import ExcelJS from "exceljs";
import { Prisma, type PrismaClient, type VendorType } from "@prisma/client";
import { VENDOR_TYPE_LABELS } from "./enums";
import { pad } from "./crud";

/**
 * Import Excel master Customer, Vendor, Commodity.
 * - Kolom Kode terisi = memperbarui data itu (sel kosong = nilai lama dibiarkan); kosong = data baru.
 *   Commodity tidak punya kode: kuncinya HS Code + Nama.
 * - Penghalang: baris tidak bisa disimpan, dilewati dan dilaporkan. Peringatan: baris tetap disimpan apa adanya.
 * - Pratinjau dan simpan memakai fungsi validasi yang sama; simpan selalu membaca ulang file.
 */

export const IMPORT_KINDS = ["customers", "vendors", "commodities"] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];
export const isImportKind = (k: string): k is ImportKind => (IMPORT_KINDS as readonly string[]).includes(k);

export const IMPORT_LABEL: Record<ImportKind, string> = { customers: "Customer", vendors: "Vendor", commodities: "Commodity" };
export const MAX_ROWS = 1000;
export const MAX_BYTES = 2 * 1024 * 1024;

type ColKind = "code" | "text" | "int" | "money" | "percent" | "bool" | "vendorType" | "email";
export type ImportCol = { key: string; header: string; kind: ColKind; required?: boolean; hint: string; examples: [string, string] };

const BOOL_HINT = "Ya / Tidak";
const VENDOR_TYPES = Object.entries(VENDOR_TYPE_LABELS) as [VendorType, string][];

export const IMPORT_SPECS: Record<ImportKind, ImportCol[]> = {
  customers: [
    { key: "code", header: "Kode", kind: "code", hint: "Kosongkan untuk customer baru (kode dibuat otomatis). Isi CUST0001 dst. untuk memperbarui customer itu; sel kosong lain = nilai lama tetap.", examples: ["", "CUST0001"] },
    { key: "name", header: "Nama", kind: "text", required: true, hint: "Wajib untuk customer baru, minimal 3 huruf. Nama yang sudah ada tidak bisa dibuat lagi.", examples: ["PT Contoh Ekspor Indonesia", ""] },
    { key: "npwp", header: "NPWP", kind: "text", hint: "15 atau 16 digit. Ketik sebagai teks supaya angka depan tidak hilang.", examples: ["0012345678901000", ""] },
    { key: "industry", header: "Industri", kind: "text", hint: "Opsional.", examples: ["Garmen", ""] },
    { key: "address", header: "Alamat", kind: "text", hint: "Opsional.", examples: ["Jl. Industri Raya No. 1", ""] },
    { key: "city", header: "Kota", kind: "text", hint: "Opsional.", examples: ["Bekasi", ""] },
    { key: "country", header: "Negara", kind: "text", hint: "Kosong = Indonesia (untuk customer baru).", examples: ["Indonesia", ""] },
    { key: "phone", header: "Telepon", kind: "text", hint: "Opsional, ketik sebagai teks.", examples: ["021-8900123", ""] },
    { key: "email", header: "Email", kind: "email", hint: "Opsional.", examples: ["finance@contoh.co.id", ""] },
    { key: "termOfPayment", header: "TOP (hari)", kind: "int", hint: "Angka 0 sampai 180. Kosong = 30 (customer baru).", examples: ["30", "45"] },
    { key: "creditLimit", header: "Credit Limit", kind: "money", hint: "Angka rupiah, 0 atau lebih. Kosong = 0 (customer baru).", examples: ["50000000", ""] },
    { key: "isShipper", header: "Shipper", kind: "bool", hint: `${BOOL_HINT}. Kosong = Ya (customer baru).`, examples: ["Ya", ""] },
    { key: "isConsignee", header: "Consignee", kind: "bool", hint: `${BOOL_HINT}. Kosong = Ya (customer baru).`, examples: ["Ya", ""] },
    { key: "picEmail", header: "Email Sales PIC", kind: "text", hint: "Email user Sales/Admin aktif. Tidak ditemukan = PIC dikosongkan (peringatan).", examples: ["sales@demo.com", ""] },
    { key: "contactName", header: "Nama Kontak", kind: "text", hint: "Kontak utama, hanya untuk customer baru.", examples: ["Budi Santoso", ""] },
    { key: "contactPosition", header: "Jabatan Kontak", kind: "text", hint: "Opsional.", examples: ["Logistic Manager", ""] },
    { key: "contactPhone", header: "Telepon Kontak", kind: "text", hint: "Opsional, ketik sebagai teks.", examples: ["0812-1111-2222", ""] },
    { key: "contactEmail", header: "Email Kontak", kind: "email", hint: "Opsional.", examples: ["budi@contoh.co.id", ""] },
    { key: "isActive", header: "Aktif", kind: "bool", hint: `${BOOL_HINT}. Kosong = Ya (customer baru).`, examples: ["Ya", "Tidak"] },
  ],
  vendors: [
    { key: "code", header: "Kode", kind: "code", hint: "Kosongkan untuk vendor baru (kode dibuat otomatis). Isi VEND0001 dst. untuk memperbarui vendor itu; sel kosong lain = nilai lama tetap.", examples: ["", "VEND0001"] },
    { key: "name", header: "Nama", kind: "text", required: true, hint: "Wajib untuk vendor baru, minimal 2 huruf. Nama yang sudah ada tidak bisa dibuat lagi.", examples: ["PT Angkutan Contoh", ""] },
    { key: "type", header: "Tipe", kind: "vendorType", required: true, hint: `Wajib untuk vendor baru: ${VENDOR_TYPES.map(([, l]) => l).join(", ")}.`, examples: ["Trucking", ""] },
    { key: "scacCode", header: "Kode Carrier/IATA", kind: "text", hint: "Opsional, mis. MAEU atau 126.", examples: ["", ""] },
    { key: "npwp", header: "NPWP", kind: "text", hint: "15 atau 16 digit. Ketik sebagai teks.", examples: ["0098765432109000", ""] },
    { key: "address", header: "Alamat", kind: "text", hint: "Opsional.", examples: ["Jl. Cakung Cilincing Km 2", ""] },
    { key: "city", header: "Kota", kind: "text", hint: "Opsional.", examples: ["Jakarta Utara", ""] },
    { key: "country", header: "Negara", kind: "text", hint: "Kosong = Indonesia (untuk vendor baru).", examples: ["Indonesia", ""] },
    { key: "phone", header: "Telepon", kind: "text", hint: "Opsional, ketik sebagai teks.", examples: ["021-4400123", ""] },
    { key: "email", header: "Email", kind: "email", hint: "Opsional.", examples: ["ops@angkutan.co.id", "billing@angkutan.co.id"] },
    { key: "isForeign", header: "Luar Negeri", kind: "bool", hint: `${BOOL_HINT}: vendor luar negeri kena PPh 26. Kosong = Tidak (vendor baru).`, examples: ["Tidak", ""] },
    { key: "pph26Rate", header: "Tarif PPh 26 (%)", kind: "percent", hint: "Opsional, 0 sampai 100. Kosong = tarif charge code.", examples: ["", ""] },
    { key: "skdNumber", header: "No. SKD", kind: "text", hint: "Opsional, nomor SKD/P3B vendor luar negeri.", examples: ["", ""] },
    { key: "isActive", header: "Aktif", kind: "bool", hint: `${BOOL_HINT}. Kosong = Ya (vendor baru).`, examples: ["Ya", ""] },
  ],
  commodities: [
    { key: "hsCode", header: "HS Code", kind: "text", required: true, hint: "Wajib, ketik sebagai teks (mis. 6109.10.00) supaya angka 0 tidak hilang.", examples: ["6109.10.00", "8471.30.00"] },
    { key: "name", header: "Nama", kind: "text", required: true, hint: "Wajib. HS Code + Nama yang sudah ada = memperbarui kolom Aktif saja.", examples: ["Kaos katun", "Laptop"] },
    { key: "isActive", header: "Aktif", kind: "bool", hint: `${BOOL_HINT}. Kosong = Ya (commodity baru).`, examples: ["Ya", "Ya"] },
  ],
};

// ---------------------------------------------------------------- membaca file

/** Header dicocokkan berdasarkan teks: tanpa beda huruf, tanpa tanda *, tanpa keterangan dalam kurung. */
export const normHeader = (h: string) => h.toLowerCase().replace(/\*/g, "").replace(/\(.*?\)/g, "").replace(/\s+/g, " ").trim();

/** Nilai sel exceljs menjadi teks: angka, teks, hyperlink, rich text, rumus (hasilnya), bool, tanggal. */
export function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return Number.isInteger(v) ? v.toFixed(0) : String(v);
  if (typeof v === "boolean") return v ? "Ya" : "Tidak";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((r) => r.text).join("").trim();
    if ("text" in v && typeof v.text === "string") return v.text.trim();
    if ("result" in v) return cellText((v as { result?: ExcelJS.CellValue }).result ?? null);
    if ("error" in v) return "";
  }
  return String(v).trim();
}

export type RawRow = { row: number; values: Record<string, string> };

/** Baca sheet pertama: header di baris 1, data mulai baris 2. Baris kosong dilewati. */
export async function readSheet(kind: ImportKind, buffer: ArrayBuffer | Buffer): Promise<RawRow[]> {
  if (buffer.byteLength > MAX_BYTES) throw new Error("File melebihi 2 MB.");
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as ArrayBuffer);
  } catch {
    throw new Error("File bukan Excel .xlsx yang valid. Simpan ulang sebagai .xlsx (Excel Workbook).");
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("File tidak punya sheet.");
  const spec = IMPORT_SPECS[kind];
  const byHeader = new Map(spec.map((c) => [normHeader(c.header), c.key]));
  const colKey = new Map<number, string>();
  ws.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
    const key = byHeader.get(normHeader(cellText(cell.value)));
    if (key && ![...colKey.values()].includes(key)) colKey.set(col, key);
  });
  const missing = spec.filter((c) => c.required && ![...colKey.values()].includes(c.key)).map((c) => c.header);
  if (missing.length) throw new Error(`Kolom wajib tidak ditemukan di baris 1: ${missing.join(", ")}. Gunakan template terbaru.`);

  const rows: RawRow[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const values: Record<string, string> = {};
    for (const [col, key] of colKey) values[key] = cellText(row.getCell(col).value);
    if (Object.values(values).every((v) => v === "")) continue;
    rows.push({ row: r, values });
    if (rows.length > MAX_ROWS) throw new Error(`Maksimal ${MAX_ROWS} baris data per file. Pecah file menjadi beberapa bagian.`);
  }
  if (rows.length === 0) throw new Error("Tidak ada baris data (baris 2 dan seterusnya kosong).");
  return rows;
}

// ---------------------------------------------------------------- validasi (murni)

export type RowAction = "create" | "update" | "unchanged" | "skip";
export type RowResult = {
  row: number; action: RowAction; key: string; label: string;
  errors: string[]; warnings: string[];
  /** Data yang akan disimpan (create: lengkap; update: hanya kolom yang diisi). */
  data: Record<string, unknown>;
  contact?: { name: string; position: string | null; phone: string | null; email: string | null } | null;
  id?: string;
};

export type ImportContext = {
  /** Kode (huruf besar) → data yang ada. */
  codes: Map<string, { id: string; name: string }>;
  /** Nama (huruf kecil) → kode. */
  names: Map<string, string>;
  /** Email user Sales/Admin aktif (huruf kecil) → id user. Hanya customer. */
  picEmails: Map<string, string>;
  /** "hs|nama huruf kecil" → commodity yang ada. Hanya commodity. */
  commodities: Map<string, { id: string; isActive: boolean }>;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const YES = new Set(["ya", "y", "yes", "true", "1", "aktif"]);
const NO = new Set(["tidak", "t", "no", "n", "false", "0", "nonaktif", "tidak aktif"]);

/** Angka dari sel: 1500000, 1500000.5, atau format Indonesia 1.500.000,50. */
export function parseNumber(s: string): number {
  const t = s.replace(/\s/g, "").replace(/^rp/i, "");
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) return Number(t.replace(/\./g, "").replace(",", "."));
  if (/^-?\d+,\d+$/.test(t)) return Number(t.replace(",", "."));
  return NaN;
}

function vendorType(s: string): VendorType | null {
  const k = s.trim().toUpperCase().replace(/[\s-]+/g, "_");
  const byKey = VENDOR_TYPES.find(([key]) => key === k);
  if (byKey) return byKey[0];
  const byLabel = VENDOR_TYPES.find(([, label]) => label.toLowerCase() === s.trim().toLowerCase() || label.toLowerCase().startsWith(`${s.trim().toLowerCase()} (`));
  return byLabel ? byLabel[0] : null;
}

/** Validasi semua baris. Urutan baris menentukan baris mana yang dianggap ganda (yang kedua dan seterusnya). */
export function validateRows(kind: ImportKind, raws: RawRow[], ctx: ImportContext): RowResult[] {
  const spec = IMPORT_SPECS[kind];
  const seenCodes = new Set<string>();
  const seenNames = new Map<string, number>();
  return raws.map(({ row, values }) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const data: Record<string, unknown> = {};
    const v = (k: string) => (values[k] ?? "").trim();

    // Kunci dan aksi
    let action: RowAction = "create";
    let id: string | undefined;
    let key = "";
    if (kind === "commodities") {
      key = v("hsCode");
      if (!key || key.length < 2) errors.push("HS Code wajib diisi (minimal 2 karakter).");
      if (!v("name") || v("name").length < 2) errors.push("Nama wajib diisi (minimal 2 karakter).");
      const ck = `${key}|${v("name").toLowerCase()}`;
      if (seenNames.has(ck)) errors.push(`HS Code + Nama sama dengan baris ${seenNames.get(ck)}.`);
      else seenNames.set(ck, row);
      const existing = ctx.commodities.get(ck);
      if (existing) { action = "update"; id = existing.id; }
    } else {
      key = v("code").toUpperCase();
      if (key) {
        const existing = ctx.codes.get(key);
        if (!existing) errors.push(`Kode ${key} tidak ditemukan. Kosongkan kolom Kode untuk membuat data baru.`);
        else { action = "update"; id = existing.id; }
        if (seenCodes.has(key)) errors.push(`Kode ${key} muncul lebih dari sekali di file.`);
        seenCodes.add(key);
      }
    }

    // Kolom per kolom: kosong pada update = tidak diubah
    for (const c of spec) {
      if (c.kind === "code" || (kind === "commodities" && (c.key === "hsCode" || c.key === "name"))) continue;
      const s = v(c.key);
      if (s === "") {
        if (c.required && action === "create") errors.push(`${c.header} wajib diisi.`);
        continue;
      }
      switch (c.kind) {
        case "text": data[c.key] = s; break;
        case "email":
          if (!EMAIL.test(s)) warnings.push(`${c.header} "${s}" bukan format email yang valid (tetap disimpan).`);
          data[c.key] = s;
          break;
        case "int": {
          const n = parseNumber(s);
          if (!Number.isInteger(n) || n < 0 || n > 180) errors.push(`${c.header} harus bilangan bulat 0 sampai 180.`);
          else data[c.key] = n;
          break;
        }
        case "money": {
          const n = parseNumber(s);
          if (!Number.isFinite(n) || n < 0) errors.push(`${c.header} harus angka 0 atau lebih.`);
          else data[c.key] = Math.round(n * 100) / 100;
          break;
        }
        case "percent": {
          const n = parseNumber(s);
          if (!Number.isFinite(n) || n < 0 || n > 100) errors.push(`${c.header} harus angka 0 sampai 100.`);
          else data[c.key] = n;
          break;
        }
        case "bool": {
          const t = s.toLowerCase();
          if (YES.has(t)) data[c.key] = true;
          else if (NO.has(t)) data[c.key] = false;
          else errors.push(`${c.header} harus Ya atau Tidak (tertulis "${s}").`);
          break;
        }
        case "vendorType": {
          const t = vendorType(s);
          if (!t) errors.push(`Tipe "${s}" tidak dikenal. Pilih: ${VENDOR_TYPES.map(([, l]) => l).join(", ")}.`);
          else data[c.key] = t;
          break;
        }
      }
    }

    // Aturan khusus customer/vendor
    let contact: RowResult["contact"] = null;
    if (kind !== "commodities") {
      const name = v("name");
      const minName = kind === "customers" ? 3 : 2;
      if (name && name.length < minName) errors.push(`Nama minimal ${minName} huruf.`);
      if (name) {
        const lower = name.toLowerCase();
        const owner = ctx.names.get(lower);
        if (owner && owner !== key) {
          errors.push(action === "create"
            ? `Nama sudah ada sebagai ${owner}. Isi kolom Kode ${owner} untuk memperbarui data itu.`
            : `Nama sudah dipakai ${owner}.`);
        }
        const prev = seenNames.get(lower);
        if (prev !== undefined) errors.push(`Nama sama dengan baris ${prev}.`);
        else seenNames.set(lower, row);
      }
      const npwp = v("npwp");
      if (npwp && ![15, 16].includes(npwp.replace(/\D/g, "").length)) warnings.push(`NPWP "${npwp}" bukan 15/16 digit (tetap disimpan).`);
      if (kind === "customers") {
        const pic = v("picEmail").toLowerCase();
        delete data.picEmail;
        if (pic) {
          const uid = ctx.picEmails.get(pic);
          if (uid) data.salesPicId = uid;
          else warnings.push(`Sales PIC "${pic}" bukan user Sales/Admin aktif, PIC dikosongkan.`);
        }
        const contactKeys = ["contactName", "contactPosition", "contactPhone", "contactEmail"];
        const hasContact = contactKeys.some((k) => v(k) !== "");
        for (const k of contactKeys) delete data[k];
        if (hasContact && action === "update") warnings.push("Kolom kontak diabaikan untuk customer yang sudah ada; ubah kontak lewat form.");
        if (hasContact && action === "create") {
          if (!v("contactName")) warnings.push("Kontak tidak dibuat karena Nama Kontak kosong.");
          else contact = { name: v("contactName"), position: v("contactPosition") || null, phone: v("contactPhone") || null, email: v("contactEmail") || null };
        }
      }
      if (action === "create") {
        data.name = name;
        data.country ??= "Indonesia";
        data.isActive ??= true;
        if (kind === "customers") {
          data.termOfPayment ??= 30;
          data.creditLimit ??= 0;
          data.isShipper ??= true;
          data.isConsignee ??= true;
        } else data.isForeign ??= false;
      }
    } else {
      data.hsCode = key;
      data.name = v("name");
      if (action === "create") data.isActive ??= true;
    }

    if (errors.length) action = "skip";
    else if (action === "update") {
      const changes = Object.keys(data).filter((k) => !(kind === "commodities" && (k === "hsCode" || k === "name")));
      if (kind === "commodities") {
        const ex = ctx.commodities.get(`${key}|${v("name").toLowerCase()}`)!;
        if (data.isActive === undefined || data.isActive === ex.isActive) { action = "unchanged"; warnings.push("Sudah ada, tidak ada perubahan."); }
      } else if (changes.length === 0) { action = "unchanged"; warnings.push("Tidak ada kolom yang diisi selain Kode."); }
    }
    const label = kind === "commodities" ? v("name") : v("name") || ctx.codes.get(key)?.name || "";
    return { row, action, key, label, errors, warnings, data, contact, id };
  });
}

// ---------------------------------------------------------------- database

type Db = PrismaClient | Prisma.TransactionClient;

export async function loadContext(db: Db, kind: ImportKind): Promise<ImportContext> {
  const ctx: ImportContext = { codes: new Map(), names: new Map(), picEmails: new Map(), commodities: new Map() };
  if (kind === "customers" || kind === "vendors") {
    const rows = kind === "customers"
      ? await db.customer.findMany({ select: { id: true, code: true, name: true } })
      : await db.vendor.findMany({ select: { id: true, code: true, name: true } });
    for (const r of rows) {
      ctx.codes.set(r.code.toUpperCase(), { id: r.id, name: r.name });
      if (!ctx.names.has(r.name.toLowerCase())) ctx.names.set(r.name.toLowerCase(), r.code.toUpperCase());
    }
  }
  if (kind === "customers") {
    const users = await db.user.findMany({ where: { role: { in: ["SALES", "ADMIN"] }, isActive: true }, select: { id: true, email: true } });
    for (const u of users) ctx.picEmails.set(u.email.toLowerCase(), u.id);
  }
  if (kind === "commodities") {
    const rows = await db.commodity.findMany({ select: { id: true, hsCode: true, name: true, isActive: true } });
    for (const r of rows) ctx.commodities.set(`${r.hsCode}|${r.name.toLowerCase()}`, { id: r.id, isActive: r.isActive });
  }
  return ctx;
}

export type ImportSummary = { total: number; create: number; update: number; unchanged: number; skip: number; warnings: number };

export function summarize(rows: RowResult[]): ImportSummary {
  return {
    total: rows.length,
    create: rows.filter((r) => r.action === "create").length,
    update: rows.filter((r) => r.action === "update").length,
    unchanged: rows.filter((r) => r.action === "unchanged").length,
    skip: rows.filter((r) => r.action === "skip").length,
    warnings: rows.filter((r) => r.warnings.length > 0).length,
  };
}

/** Pratinjau: tidak menulis apa pun. */
export async function previewImport(db: PrismaClient, kind: ImportKind, buffer: ArrayBuffer | Buffer) {
  const rows = validateRows(kind, await readSheet(kind, buffer), await loadContext(db, kind));
  return { rows, summary: summarize(rows) };
}

/** Kode baru berikutnya, sama dengan form Customer/Vendor Baru (CUST0001 / VEND0001). */
async function lastNumber(tx: Prisma.TransactionClient, kind: "customers" | "vendors") {
  const prefix = kind === "customers" ? "CUST" : "VEND";
  const last = kind === "customers"
    ? await tx.customer.findFirst({ where: { code: { startsWith: prefix } }, orderBy: { code: "desc" }, select: { code: true } })
    : await tx.vendor.findFirst({ where: { code: { startsWith: prefix } }, orderBy: { code: "desc" }, select: { code: true } });
  return { prefix, n: last ? parseInt(last.code.replace(prefix, ""), 10) || 0 : 0 };
}

/**
 * Simpan: baca dan validasi ulang file di dalam satu transaksi, lalu buat/perbarui semua baris yang bukan penghalang.
 * Bentrok unik (user lain menyimpan bersamaan) menggagalkan seluruh import, jadi tidak ada data setengah masuk.
 */
export async function commitImport(db: PrismaClient, kind: ImportKind, buffer: ArrayBuffer | Buffer) {
  const raws = await readSheet(kind, buffer);
  try {
    return await db.$transaction(async (tx) => {
      const rows = validateRows(kind, raws, await loadContext(tx, kind));
      const created: string[] = [];
      if (kind === "commodities") {
        for (const r of rows) {
          if (r.action === "create") created.push((await tx.commodity.create({ data: { hsCode: String(r.data.hsCode), name: String(r.data.name), isActive: r.data.isActive !== false } })).id);
          if (r.action === "update") await tx.commodity.update({ where: { id: r.id }, data: { isActive: r.data.isActive === true } });
        }
      } else {
        const { prefix, n: last } = await lastNumber(tx, kind);
        let n = last;
        for (const r of rows) {
          if (r.action === "create") {
            n += 1;
            const code = `${prefix}${pad(n)}`;
            r.key = code;
            if (kind === "customers") {
              const { creditLimit, ...rest } = r.data;
              const c = await tx.customer.create({
                data: {
                  ...(rest as Omit<Prisma.CustomerUncheckedCreateInput, "code" | "creditLimit">), code,
                  creditLimit: new Prisma.Decimal(Number(creditLimit ?? 0)),
                  ...(r.contact ? { contacts: { create: [{ ...r.contact, isPrimary: true }] } } : {}),
                },
              });
              created.push(c.id);
            } else {
              const { pph26Rate, ...rest } = r.data;
              const v = await tx.vendor.create({
                data: {
                  ...(rest as Omit<Prisma.VendorUncheckedCreateInput, "code" | "pph26Rate">), code,
                  ...(pph26Rate !== undefined ? { pph26Rate: new Prisma.Decimal(Number(pph26Rate)) } : {}),
                },
              });
              created.push(v.id);
            }
          }
          if (r.action === "update") {
            if (kind === "customers") {
              const { creditLimit, ...rest } = r.data;
              await tx.customer.update({ where: { id: r.id }, data: { ...(rest as Prisma.CustomerUncheckedUpdateInput), ...(creditLimit !== undefined ? { creditLimit: new Prisma.Decimal(Number(creditLimit)) } : {}) } });
            } else {
              const { pph26Rate, ...rest } = r.data;
              await tx.vendor.update({ where: { id: r.id }, data: { ...(rest as Prisma.VendorUncheckedUpdateInput), ...(pph26Rate !== undefined ? { pph26Rate: new Prisma.Decimal(Number(pph26Rate)) } : {}) } });
            }
          }
        }
      }
      return { rows, summary: summarize(rows), created };
    }, { timeout: 60_000, maxWait: 10_000 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new Error("Ada data yang baru saja dibuat user lain bersamaan (kode atau HS Code + Nama bentrok). Tidak ada yang disimpan; coba simpan lagi.");
    }
    throw e;
  }
}

// ---------------------------------------------------------------- template

const TEXT_KINDS = new Set<ColKind>(["code", "text", "email"]);

/** Template .xlsx: sheet Data (header + dropdown), Petunjuk, dan Contoh (tidak ikut ter-import). */
export async function buildTemplate(kind: ImportKind): Promise<Buffer> {
  const spec = IMPORT_SPECS[kind];
  const wb = new ExcelJS.Workbook();
  wb.creator = "CargoFlow";
  wb.created = new Date();
  const header = (c: ImportCol) => (c.required ? `${c.header} *` : c.header);
  const col = (i: number) => {
    let s = "";
    for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    return s;
  };

  const data = wb.addWorksheet("Data", { views: [{ state: "frozen", ySplit: 1 }] });
  data.columns = spec.map((c) => ({ header: header(c), key: c.key, width: Math.max(14, c.header.length + 6), style: TEXT_KINDS.has(c.kind) ? { numFmt: "@" } : {} }));
  data.getRow(1).font = { bold: true };
  data.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5EEF9" } };
  spec.forEach((c, i) => {
    const list = c.kind === "bool" ? '"Ya,Tidak"' : c.kind === "vendorType" ? `"${VENDOR_TYPES.map(([, l]) => l).join(",")}"` : null;
    if (list) {
      // dataValidations ada di exceljs 4.x tetapi belum ada di deklarasi tipenya.
      (data as unknown as { dataValidations: { add(range: string, v: ExcelJS.DataValidation): void } }).dataValidations.add(`${col(i)}2:${col(i)}${MAX_ROWS + 1}`, {
        type: "list", allowBlank: true, formulae: [list], showErrorMessage: true, errorStyle: "warning",
        errorTitle: c.header, error: c.kind === "bool" ? "Isi Ya atau Tidak." : "Pilih tipe vendor dari daftar.",
      });
    }
  });

  const help = wb.addWorksheet("Petunjuk");
  help.columns = [{ header: "Kolom", key: "h", width: 24 }, { header: "Wajib", key: "r", width: 10 }, { header: "Keterangan", key: "d", width: 100 }];
  help.getRow(1).font = { bold: true };
  for (const c of spec) help.addRow({ h: c.header, r: c.required ? "Ya" : "", d: c.hint });
  help.addRow({});
  const notes = [
    "Isi data di sheet Data mulai baris 2. Jangan mengubah teks judul kolom di baris 1; urutan kolom boleh berubah.",
    kind === "commodities"
      ? "HS Code + Nama yang sudah ada tidak dibuat lagi; hanya kolom Aktif yang diperbarui."
      : "Kolom Kode kosong = data baru (kode dibuat otomatis). Kode terisi = memperbarui data itu; sel kosong = nilai lama tetap.",
    "Baris yang salah fatal (mis. kolom wajib kosong) dilewati dan dilaporkan; peringatan (mis. format email) tetap disimpan.",
    `Maksimal ${MAX_ROWS} baris dan 2 MB per file, format .xlsx. Sheet Contoh hanya contoh dan tidak ikut dibaca.`,
  ];
  for (const n of notes) help.addRow({ h: "", r: "", d: n });

  const ex = wb.addWorksheet("Contoh");
  ex.columns = spec.map((c) => ({ header: header(c), key: c.key, width: Math.max(14, c.header.length + 6), style: TEXT_KINDS.has(c.kind) ? { numFmt: "@" } : {} }));
  ex.getRow(1).font = { bold: true };
  for (const i of [0, 1] as const) ex.addRow(Object.fromEntries(spec.map((c) => [c.key, c.examples[i]])));

  return Buffer.from(await wb.xlsx.writeBuffer());
}
