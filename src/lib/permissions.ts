/**
 * Katalog izin — satu-satunya sumber kebenaran hak akses (menu, tombol/aksi, persetujuan, maker-checker, batas data).
 *
 * Jenis izin:
 * - view    : boleh membuka menu/halaman modul.
 * - action  : boleh menjalankan tombol/aksi.
 * - approve : aksi persetujuan/pembatalan (biasanya punya pasangan `own`).
 * - own     : maker-checker — boleh menjalankan aksi `approve` pasangannya pada dokumen yang ia buat/ajukan/kirim sendiri.
 * - scope   : boleh melihat SEMUA data modul; tanpa izin ini user hanya melihat data miliknya (Sales PIC atau pembuat).
 *
 * Role disimpan di tabel AppRole (daftar kunci izin). Role Admin (`isSystem`) selalu memegang semua izin.
 * Kunci yang tidak ada di katalog diabaikan; izin aksi apa pun pada modul menyiratkan izin `view` modul itu.
 */

export type PermKind = "view" | "action" | "approve" | "own" | "scope";

const GROUPS = [
  {
    label: "Utama",
    modules: [
      { key: "dashboard", label: "Dashboard", perms: [{ key: "dashboard.view", label: "Lihat dashboard", kind: "view" }] },
    ],
  },
  {
    label: "Ekspor-Impor",
    modules: [
      {
        key: "rates", label: "Rate Management", perms: [
          { key: "rates.view", label: "Lihat rate", kind: "view" },
          { key: "rates.create", label: "Tambah rate", kind: "action" },
          { key: "rates.edit", label: "Ubah rate", kind: "action" },
        ],
      },
      {
        key: "quotations", label: "Quotation", perms: [
          { key: "quotations.view", label: "Lihat quotation", kind: "view" },
          { key: "quotations.viewAll", label: "Lihat semua quotation (bukan hanya milik sendiri)", kind: "scope" },
          { key: "quotations.create", label: "Buat quotation (Draft)", kind: "action" },
          { key: "quotations.submit", label: "Ajukan quotation", kind: "action" },
          { key: "quotations.return", label: "Kembalikan quotation ke Draft (revisi)", kind: "approve" },
          { key: "quotations.send", label: "Kirim quotation ke customer", kind: "approve" },
          { key: "quotations.sendLowMargin", label: "Kirim quotation dengan margin < 10%", kind: "approve" },
          { key: "quotations.decide", label: "Terima / Tolak quotation", kind: "approve" },
          { key: "quotations.decideOwn", label: "Boleh kirim/kembalikan/terima/tolak quotation yang ia buat, ajukan, atau kirim sendiri", kind: "own" },
          { key: "quotations.convert", label: "Convert quotation ke Job", kind: "action" },
        ],
      },
      {
        key: "jobs", label: "Job / Shipment", perms: [
          { key: "jobs.view", label: "Lihat job", kind: "view" },
          { key: "jobs.viewAll", label: "Lihat semua job (bukan hanya milik sendiri)", kind: "scope" },
          { key: "jobs.viewFinancials", label: "Lihat nilai uang job (revenue, cost, profit, margin)", kind: "view" },
          { key: "jobs.create", label: "Buat job manual", kind: "action" },
          { key: "jobs.status", label: "Ubah status job", kind: "action" },
          { key: "jobs.cancel", label: "Batalkan job", kind: "approve" },
          { key: "jobs.milestone", label: "Centang / tambah milestone", kind: "action" },
          { key: "jobs.charges", label: "Tambah / ubah / hapus charge (costing)", kind: "action" },
          { key: "jobs.containers", label: "Tambah / ubah / hapus container", kind: "action" },
          { key: "jobs.clearance", label: "Ubah data clearance & terapkan rate card", kind: "action" },
          { key: "jobs.fleetCost", label: "Catat biaya armada sendiri", kind: "action" },
        ],
      },
      { key: "bookings", label: "Booking", perms: [{ key: "bookings.view", label: "Lihat booking", kind: "view" }] },
      {
        key: "documents", label: "Dokumentasi", perms: [
          { key: "documents.view", label: "Lihat daftar dokumen", kind: "view" },
          { key: "documents.generate", label: "Cetak dokumen PDF (B/L, SI, Arrival, DO)", kind: "action" },
        ],
      },
      { key: "tracking", label: "Tracking", perms: [{ key: "tracking.view", label: "Lihat tracking internal", kind: "view" }] },
    ],
  },
  {
    label: "Domestik",
    modules: [
      {
        key: "domestic", label: "Pengiriman (STT)", perms: [
          { key: "domestic.view", label: "Lihat STT", kind: "view" },
          { key: "domestic.viewAll", label: "Lihat semua STT (bukan hanya milik sendiri)", kind: "scope" },
          { key: "domestic.create", label: "Buat STT", kind: "action" },
          { key: "domestic.status", label: "Ubah status STT / bukti terima", kind: "action" },
          { key: "domestic.cancel", label: "Batalkan STT", kind: "approve" },
          { key: "domestic.cancelOwn", label: "Boleh membatalkan STT buatan sendiri", kind: "own" },
          { key: "domestic.invoice", label: "Buat invoice dari STT", kind: "action" },
          { key: "domestic.print", label: "Cetak STT (PDF)", kind: "action" },
        ],
      },
      { key: "domesticCheck", label: "Cek Tarif", perms: [{ key: "domesticCheck.view", label: "Cek tarif domestik", kind: "view" }] },
      {
        key: "domesticTariffs", label: "Tarif Domestik", perms: [
          { key: "domesticTariffs.view", label: "Lihat tarif domestik", kind: "view" },
          { key: "domesticTariffs.edit", label: "Tambah / ubah tarif domestik", kind: "action" },
        ],
      },
    ],
  },
  {
    label: "Finance",
    modules: [
      { key: "costing", label: "Costing", perms: [{ key: "costing.view", label: "Lihat costing & profitabilitas", kind: "view" }] },
      {
        key: "invoices", label: "Invoice (AR)", perms: [
          { key: "invoices.view", label: "Lihat invoice", kind: "view" },
          { key: "invoices.viewAll", label: "Lihat semua invoice (bukan hanya milik sendiri)", kind: "scope" },
          { key: "invoices.create", label: "Buat invoice dari job", kind: "action" },
          { key: "invoices.receipt", label: "Catat pembayaran (receipt)", kind: "action" },
          { key: "invoices.cancel", label: "Batalkan invoice", kind: "approve" },
          { key: "invoices.cancelOwn", label: "Boleh membatalkan invoice buatan sendiri", kind: "own" },
          { key: "invoices.print", label: "Cetak invoice (PDF)", kind: "action" },
        ],
      },
      {
        key: "bills", label: "Vendor Bill (AP)", perms: [
          { key: "bills.view", label: "Lihat vendor bill", kind: "view" },
          { key: "bills.viewAll", label: "Lihat semua vendor bill (bukan hanya milik sendiri)", kind: "scope" },
          { key: "bills.create", label: "Buat vendor bill dari job", kind: "action" },
          { key: "bills.pay", label: "Catat pembayaran ke vendor", kind: "action" },
        ],
      },
      {
        key: "notes", label: "Debit/Credit Note", perms: [
          { key: "notes.view", label: "Lihat debit/credit note", kind: "view" },
          { key: "notes.viewAll", label: "Lihat semua note (bukan hanya milik sendiri)", kind: "scope" },
        ],
      },
      {
        key: "payments", label: "Receipt & Payment", perms: [
          { key: "payments.view", label: "Lihat receipt & payment", kind: "view" },
          { key: "payments.viewAll", label: "Lihat semua receipt & payment (bukan hanya milik sendiri)", kind: "scope" },
        ],
      },
    ],
  },
  {
    label: "Akuntansi",
    modules: [
      { key: "accounting", label: "Accounting (TB, Laba Rugi, Neraca, Buku Besar, Jurnal)", perms: [{ key: "accounting.view", label: "Lihat laporan akuntansi & jurnal", kind: "view" }] },
      {
        key: "cashEntry", label: "Kas Masuk / Keluar & Transfer", perms: [
          { key: "cashEntry.view", label: "Lihat kas masuk/keluar & transfer", kind: "view" },
          { key: "cashEntry.create", label: "Catat kas masuk/keluar", kind: "action" },
          { key: "cashEntry.cancel", label: "Batalkan kas masuk/keluar", kind: "approve" },
          { key: "cashEntry.cancelOwn", label: "Boleh membatalkan kas masuk/keluar buatan sendiri", kind: "own" },
          { key: "cashEntry.transfer", label: "Catat transfer antar rekening", kind: "action" },
          { key: "cashEntry.transferCancel", label: "Batalkan transfer", kind: "approve" },
          { key: "cashEntry.transferCancelOwn", label: "Boleh membatalkan transfer buatan sendiri", kind: "own" },
        ],
      },
      {
        key: "manualJournal", label: "Jurnal Manual", perms: [
          { key: "manualJournal.view", label: "Lihat jurnal manual", kind: "view" },
          { key: "manualJournal.create", label: "Posting jurnal manual", kind: "action" },
          { key: "manualJournal.cancel", label: "Batalkan jurnal manual", kind: "approve" },
          { key: "manualJournal.cancelOwn", label: "Boleh membatalkan jurnal manual buatan sendiri", kind: "own" },
        ],
      },
      { key: "cashFlow", label: "Arus Kas", perms: [{ key: "cashFlow.view", label: "Lihat arus kas", kind: "view" }] },
      {
        key: "closing", label: "Tutup Buku", perms: [
          { key: "closing.view", label: "Lihat tutup buku", kind: "view" },
          { key: "closing.lockPeriod", label: "Kunci / buka periode", kind: "approve" },
          { key: "closing.closeYear", label: "Tutup buku tahunan", kind: "approve" },
        ],
      },
      {
        key: "fixedAssets", label: "Aset Tetap", perms: [
          { key: "fixedAssets.view", label: "Lihat aset tetap", kind: "view" },
          { key: "fixedAssets.manage", label: "Tambah aset tetap", kind: "action" },
          { key: "fixedAssets.depreciate", label: "Jalankan penyusutan", kind: "approve" },
        ],
      },
      {
        key: "tax", label: "Pajak (setoran per masa)", perms: [
          { key: "tax.view", label: "Lihat pajak per masa", kind: "view" },
          { key: "tax.remit", label: "Setor pajak", kind: "approve" },
          { key: "tax.cancel", label: "Batalkan setoran pajak", kind: "approve" },
          { key: "tax.cancelOwn", label: "Boleh membatalkan setoran pajak buatan sendiri", kind: "own" },
        ],
      },
      {
        key: "bankRec", label: "Rekonsiliasi Bank", perms: [
          { key: "bankRec.view", label: "Lihat rekonsiliasi bank", kind: "view" },
          { key: "bankRec.manage", label: "Import rekening koran, cocokkan, rekonsiliasi", kind: "action" },
        ],
      },
      {
        key: "fx", label: "Revaluasi Kurs", perms: [
          { key: "fx.view", label: "Lihat revaluasi kurs", kind: "view" },
          { key: "fx.revalue", label: "Jalankan revaluasi kurs", kind: "approve" },
        ],
      },
    ],
  },
  {
    label: "Laporan",
    modules: [
      {
        key: "reports", label: "Reporting", perms: [
          { key: "reports.view", label: "Lihat laporan", kind: "view" },
          { key: "reports.export", label: "Export Excel", kind: "action" },
        ],
      },
    ],
  },
  {
    label: "Master Data",
    modules: [
      {
        key: "customers", label: "Customer", perms: [
          { key: "customers.view", label: "Lihat customer", kind: "view" },
          { key: "customers.viewAll", label: "Lihat semua customer (bukan hanya milik sendiri)", kind: "scope" },
          { key: "customers.create", label: "Tambah customer", kind: "action" },
          { key: "customers.edit", label: "Ubah customer & gudang", kind: "action" },
        ],
      },
      { key: "vendors", label: "Vendor", perms: [{ key: "vendors.view", label: "Lihat vendor", kind: "view" }, { key: "vendors.edit", label: "Tambah / ubah vendor", kind: "action" }] },
      { key: "agents", label: "Overseas Agent", perms: [{ key: "agents.view", label: "Lihat agent", kind: "view" }, { key: "agents.edit", label: "Tambah / ubah agent", kind: "action" }] },
      { key: "ports", label: "Port & Airport", perms: [{ key: "ports.view", label: "Lihat port & airport", kind: "view" }, { key: "ports.edit", label: "Tambah / ubah port & airport", kind: "action" }] },
      { key: "bankAccounts", label: "Kas & Rekening", perms: [{ key: "bankAccounts.view", label: "Lihat kas & rekening", kind: "view" }, { key: "bankAccounts.edit", label: "Tambah / ubah kas & rekening", kind: "action" }] },
      { key: "vehicles", label: "Armada Sendiri", perms: [{ key: "vehicles.view", label: "Lihat armada", kind: "view" }, { key: "vehicles.edit", label: "Tambah / ubah armada", kind: "action" }] },
      {
        key: "currencies", label: "Currency & Kurs", perms: [
          { key: "currencies.view", label: "Lihat currency & kurs", kind: "view" },
          { key: "currencies.edit", label: "Tambah currency / kurs manual", kind: "action" },
          { key: "currencies.sync", label: "Sinkron kurs otomatis", kind: "action" },
        ],
      },
      {
        key: "charges", label: "Charge Code", perms: [
          { key: "charges.view", label: "Lihat charge code", kind: "view" },
          { key: "charges.create", label: "Tambah charge code", kind: "action" },
          { key: "charges.edit", label: "Ubah pajak / cetak / pemetaan akun charge code", kind: "action" },
        ],
      },
      { key: "rateCard", label: "Rate Card", perms: [{ key: "rateCard.view", label: "Lihat rate card", kind: "view" }, { key: "rateCard.edit", label: "Tambah / ubah rate card", kind: "action" }] },
      { key: "weightRules", label: "Aturan Berat", perms: [{ key: "weightRules.view", label: "Lihat aturan berat", kind: "view" }, { key: "weightRules.edit", label: "Ubah aturan berat", kind: "action" }] },
      { key: "containers", label: "Container Type", perms: [{ key: "containers.view", label: "Lihat container type", kind: "view" }, { key: "containers.edit", label: "Tambah / ubah container type", kind: "action" }] },
      { key: "commodities", label: "Commodity", perms: [{ key: "commodities.view", label: "Lihat commodity", kind: "view" }, { key: "commodities.edit", label: "Tambah / ubah commodity", kind: "action" }] },
      { key: "taxes", label: "Pajak (master tarif)", perms: [{ key: "taxes.view", label: "Lihat tarif pajak", kind: "view" }, { key: "taxes.edit", label: "Tambah / ubah tarif pajak", kind: "action" }] },
      { key: "coa", label: "Chart of Accounts", perms: [{ key: "coa.view", label: "Lihat chart of accounts", kind: "view" }] },
    ],
  },
  {
    label: "Sistem",
    modules: [
      { key: "users", label: "User Management", perms: [{ key: "users.view", label: "Lihat user", kind: "view" }, { key: "users.manage", label: "Tambah / ubah user, reset password, aktif/nonaktif", kind: "action" }] },
      { key: "roles", label: "Role Management", perms: [{ key: "roles.view", label: "Lihat role", kind: "view" }, { key: "roles.manage", label: "Buat / ubah / hapus role dan izinnya", kind: "action" }] },
      { key: "audit", label: "Audit Log", perms: [{ key: "audit.view", label: "Lihat audit log", kind: "view" }] },
      { key: "logs", label: "Log Error", perms: [{ key: "logs.view", label: "Lihat log error aplikasi", kind: "view" }] },
      {
        key: "settings", label: "Setting Perusahaan", perms: [
          { key: "settings.view", label: "Lihat setting perusahaan", kind: "view" },
          { key: "settings.edit", label: "Ubah setting & logo perusahaan", kind: "action" },
        ],
      },
    ],
  },
] as const;

type Groups = typeof GROUPS;
export type ModuleKey = Groups[number]["modules"][number]["key"];
export type PermissionKey = Groups[number]["modules"][number]["perms"][number]["key"];
export type PermDef = { key: PermissionKey; label: string; kind: PermKind; module: ModuleKey };
export type ModuleDef = { key: ModuleKey; label: string; perms: PermDef[] };
export type GroupDef = { label: string; modules: ModuleDef[] };

export const PERMISSION_GROUPS: GroupDef[] = GROUPS.map((g) => ({
  label: g.label,
  modules: g.modules.map((m) => ({
    key: m.key, label: m.label,
    perms: m.perms.map((p) => ({ key: p.key, label: p.label, kind: p.kind, module: m.key })),
  })),
}));

export const ALL_PERMISSIONS: PermDef[] = PERMISSION_GROUPS.flatMap((g) => g.modules.flatMap((m) => m.perms));
export const ALL_PERMISSION_KEYS: PermissionKey[] = ALL_PERMISSIONS.map((p) => p.key);
const KEY_SET = new Set<string>(ALL_PERMISSION_KEYS);
const MODULE_OF = new Map<string, ModuleKey>(ALL_PERMISSIONS.map((p) => [p.key, p.module]));

export function isPermissionKey(k: string): k is PermissionKey {
  return KEY_SET.has(k);
}

/**
 * Normalisasi daftar izin dari DB/form: buang kunci tak dikenal & duplikat, lalu tambahkan `<modul>.view` untuk setiap
 * modul yang punya izin lain (izin aksi selalu butuh bisa membuka modulnya).
 */
export function normalizePermissions(keys: unknown): PermissionKey[] {
  const arr = Array.isArray(keys) ? keys : [];
  const out = new Set<PermissionKey>();
  for (const k of arr) if (typeof k === "string" && isPermissionKey(k)) out.add(k);
  for (const k of [...out]) {
    const view = `${MODULE_OF.get(k)}.view`;
    if (isPermissionKey(view)) out.add(view);
  }
  return ALL_PERMISSION_KEYS.filter((k) => out.has(k));
}

// ---------------------------------------------------------------- role awal

export const ADMIN_ROLE_KEY = "ADMIN";

const views = (...mods: ModuleKey[]) => mods.map((m) => `${m}.view`);

/** Role awal (seed & migrasi). Admin tidak dicantumkan: sebagai role sistem ia selalu memegang semua izin. */
export const DEFAULT_ROLES: { key: string; name: string; description: string; permissions: string[] }[] = [
  {
    key: "SALES", name: "Sales",
    description: "Membuat dan mengajukan quotation; melihat customer, quotation, job, STT, dan invoice miliknya sendiri.",
    permissions: [
      ...views("dashboard", "tracking", "vendors", "agents", "ports", "vehicles", "currencies", "charges", "rateCard",
        "containers", "commodities", "taxes", "weightRules", "jobs", "costing", "invoices", "reports", "domesticCheck",
        "domesticTariffs"),
      "rates.view", "rates.create", "rates.edit",
      "jobs.viewFinancials",
      "quotations.view", "quotations.create", "quotations.submit",
      "customers.view", "customers.create", "customers.edit",
      "commodities.edit", "weightRules.edit", "domesticTariffs.edit",
      "domestic.view", "domestic.create", "domestic.status", "domestic.print",
    ],
  },
  {
    key: "OPERATION", name: "Operation",
    description: "Mereview, mengirim, dan memutuskan quotation; mengonversi ke job dan mengelola job, booking, dokumen, domestik.",
    permissions: [
      ...views("dashboard", "tracking", "currencies", "charges", "rateCard", "domesticCheck", "domesticTariffs", "rates",
        "costing", "reports", "bookings"),
      "customers.view", "customers.viewAll",
      "vendors.view", "vendors.edit", "agents.view", "agents.edit", "ports.view", "ports.edit",
      "vehicles.view", "vehicles.edit", "containers.view", "containers.edit", "commodities.view", "commodities.edit",
      "weightRules.view", "weightRules.edit",
      "quotations.view", "quotations.viewAll", "quotations.return", "quotations.send", "quotations.sendLowMargin",
      "quotations.decide", "quotations.convert",
      "jobs.view", "jobs.viewAll", "jobs.create", "jobs.status", "jobs.cancel", "jobs.milestone", "jobs.charges",
      "jobs.containers", "jobs.clearance", "jobs.fleetCost",
      "documents.view", "documents.generate",
      "domestic.view", "domestic.viewAll", "domestic.create", "domestic.status", "domestic.cancel", "domestic.cancelOwn", "domestic.print",
    ],
  },
  {
    key: "DOCUMENTATION", name: "Documentation",
    description: "Dokumen B/L, AWB, SI, DO dan tracking.",
    permissions: [
      ...views("dashboard", "tracking", "ports", "vehicles", "currencies", "containers", "commodities", "weightRules", "bookings"),
      "jobs.view", "jobs.viewAll", "domestic.view", "domestic.viewAll", "domestic.print",
      "documents.view", "documents.generate",
    ],
  },
  {
    key: "FINANCE", name: "Finance",
    description: "Costing, invoice, bill, pembayaran, akuntansi, pajak, dan laporan.",
    permissions: [
      ...views("dashboard", "tracking", "ports", "vehicles", "containers", "commodities", "weightRules", "coa",
        "domesticCheck", "domesticTariffs", "costing", "accounting", "cashFlow", "documents"),
      "documents.generate",
      "customers.view", "customers.viewAll",
      "vendors.view", "vendors.edit", "agents.view", "agents.edit",
      "currencies.view", "currencies.edit", "currencies.sync",
      "charges.view", "charges.create", "charges.edit", "rateCard.view", "rateCard.edit",
      "taxes.view", "taxes.edit", "bankAccounts.view", "bankAccounts.edit",
      "jobs.view", "jobs.viewAll", "jobs.charges", "jobs.fleetCost",
      "jobs.viewFinancials",
      "domestic.view", "domestic.viewAll", "domestic.invoice", "domestic.print",
      "invoices.view", "invoices.viewAll", "invoices.create", "invoices.receipt", "invoices.cancel", "invoices.cancelOwn", "invoices.print",
      "bills.view", "bills.viewAll", "bills.create", "bills.pay",
      "notes.view", "notes.viewAll", "payments.view", "payments.viewAll",
      "cashEntry.view", "cashEntry.create", "cashEntry.cancel", "cashEntry.cancelOwn", "cashEntry.transfer", "cashEntry.transferCancel", "cashEntry.transferCancelOwn",
      "manualJournal.view", "manualJournal.create", "manualJournal.cancel", "manualJournal.cancelOwn",
      "closing.view", "closing.lockPeriod", "closing.closeYear",
      "fixedAssets.view", "fixedAssets.manage", "fixedAssets.depreciate",
      "tax.view", "tax.remit", "tax.cancel", "tax.cancelOwn",
      "bankRec.view", "bankRec.manage", "fx.view", "fx.revalue",
      "reports.view", "reports.export", "settings.view",
    ],
  },
  {
    key: "MANAGEMENT", name: "Management",
    description: "Melihat seluruh modul dan data (read-only), termasuk export laporan.",
    permissions: [
      ...ALL_PERMISSIONS.filter((p) => p.kind === "view" || p.kind === "scope").map((p) => p.key),
      "reports.export", "invoices.print", "documents.generate", "domestic.print",
    ],
  },
];
