import { describe, it, expect } from "vitest";
import {
  ALL_PERMISSIONS, ALL_PERMISSION_KEYS, DEFAULT_ROLES, EDITABLE_PERMISSION_GROUPS, PERMISSION_GROUPS, SUPER_ADMIN_ONLY,
  holderHasPerm, isPermissionKey, normalizeCustomPermissions, normalizePermissions, permissionsOfRole,
} from "@/lib/permissions";
import { NAV } from "@/config/nav";

describe("katalog izin", () => {
  it("kunci unik dan berformat <modul>.<izin>", () => {
    expect(new Set(ALL_PERMISSION_KEYS).size).toBe(ALL_PERMISSION_KEYS.length);
    for (const p of ALL_PERMISSIONS) expect(p.key.startsWith(`${p.module}.`)).toBe(true);
  });

  it("setiap modul punya izin view", () => {
    for (const g of PERMISSION_GROUPS) for (const m of g.modules) expect(m.perms.some((p) => p.key === `${m.key}.view`)).toBe(true);
  });

  it("setiap izin 'dokumen sendiri' punya pasangan persetujuan di modul yang sama", () => {
    for (const p of ALL_PERMISSIONS.filter((x) => x.kind === "own")) {
      expect(ALL_PERMISSIONS.some((x) => x.module === p.module && x.kind === "approve")).toBe(true);
    }
  });

  it("setiap menu memakai izin view yang ada di katalog", () => {
    for (const item of NAV.flatMap((g) => g.items)) {
      expect(isPermissionKey(item.perm)).toBe(true);
      expect(item.perm.endsWith(".view")).toBe(true);
    }
  });
});

describe("normalizePermissions", () => {
  it("membuang kunci tak dikenal & duplikat, dan menambahkan view modul", () => {
    expect(normalizePermissions(["quotations.send", "quotations.send", "hack.all", 42])).toEqual(["quotations.view", "quotations.send"]);
  });

  it("input bukan array menjadi kosong", () => {
    expect(normalizePermissions(null)).toEqual([]);
    expect(normalizePermissions("quotations.view")).toEqual([]);
  });
});

describe("role awal", () => {
  const role = (key: string) => new Set(normalizePermissions(DEFAULT_ROLES.find((r) => r.key === key)!.permissions));

  it("semua kunci di role awal ada di katalog", () => {
    for (const r of DEFAULT_ROLES) for (const k of r.permissions) expect(isPermissionKey(k), `${r.key}: ${k}`).toBe(true);
  });

  it("Sales hanya membuat & mengajukan quotation, data miliknya sendiri", () => {
    const s = role("SALES");
    for (const k of ["quotations.create", "quotations.submit"]) expect(s.has(k as never)).toBe(true);
    for (const k of ["quotations.send", "quotations.decide", "quotations.return", "quotations.convert", "quotations.viewAll", "customers.viewAll", "jobs.viewAll"]) {
      expect(s.has(k as never), k).toBe(false);
    }
  });

  it("Operation tanpa nilai tagihan dan tanpa input biaya (aturan client SLG 5-6 Nov)", () => {
    const o = role("OPERATION");
    for (const k of [
      "costing.view", "reports.view", "charges.view", "rateCard.view", "rates.view", "jobs.charges", "jobs.fleetCost", "jobs.viewFinancials",
      "invoices.view", "quotations.view", "quotations.send", "quotations.decide", "quotations.convert",
    ]) expect(o.has(k as never), k).toBe(false);
    for (const k of ["jobs.create", "jobs.status", "jobs.containers", "jobs.clearance", "jobs.bl", "tracking.view", "documents.generate"]) {
      expect(o.has(k as never), k).toBe(true);
    }
  });

  it("Management hanya melihat (tanpa aksi); maker-checker quotation aktif bawaan", () => {
    const actionKinds = new Set(["action", "approve", "own"]);
    const allowedExtra = new Set(["reports.export", "invoices.print", "documents.generate", "domestic.print", "vouchers.print"]);
    for (const k of role("MANAGEMENT")) {
      const def = ALL_PERMISSIONS.find((p) => p.key === k)!;
      if (actionKinds.has(def.kind)) expect(allowedExtra.has(k), k).toBe(true);
    }
    // Maker-checker quotation (aturan bisnis yang diminta) aktif bawaan: tidak ada role awal yang memegang decideOwn.
    for (const r of DEFAULT_ROLES) expect(normalizePermissions(r.permissions)).not.toContain("quotations.decideOwn");
    // Pembatalan dokumen keuangan khusus Admin sejak 18 Nov (client 17 Nov); STT tidak termasuk keputusan itu.
    expect(role("FINANCE").has("invoices.cancelOwn" as never)).toBe(false);
    expect(role("OPERATION").has("domestic.cancelOwn" as never)).toBe(true);
  });
});

describe("batal/hapus transaksi khusus Admin (client 17 Nov)", () => {
  const ADMIN_ONLY = [
    "invoices.cancel", "invoices.cancelOwn", "bills.cancel", "bills.cancelOwn", "vouchers.cancel", "vouchers.cancelOwn",
    "payments.cancel", "payments.cancelOwn", "cashEntry.cancel", "cashEntry.cancelOwn", "cashEntry.transferCancel",
    "cashEntry.transferCancelOwn", "manualJournal.cancel", "manualJournal.cancelOwn", "tax.cancel", "tax.cancelOwn",
    "jobs.cancel", "jobs.statusBack", "closing.reopenMonth",
  ] as const;

  it("semua izin khusus Admin ada di katalog", () => {
    for (const k of ADMIN_ONLY) expect(isPermissionKey(k), k).toBe(true);
  });

  it("tidak ada role bawaan non-sistem yang memegangnya", () => {
    for (const r of DEFAULT_ROLES) {
      const held = new Set(normalizePermissions(r.permissions));
      for (const k of ADMIN_ONLY) expect(held.has(k), `${r.key}: ${k}`).toBe(false);
    }
  });

  it("Admin dan Super Admin memegang semuanya", () => {
    for (const key of ["ADMIN", "SUPER_ADMIN"]) {
      const held = new Set(permissionsOfRole({ key, isSystem: true, permissions: [] }));
      for (const k of ADMIN_ONLY) expect(held.has(k), `${key}: ${k}`).toBe(true);
    }
  });

  it("Finance tetap bisa mencatat dan mengedit (bukan membatalkan)", () => {
    const fin = new Set(normalizePermissions(DEFAULT_ROLES.find((r) => r.key === "FINANCE")!.permissions));
    for (const k of ["invoices.edit", "invoices.receipt", "bills.edit", "bills.pay", "vouchers.create", "vouchers.pay", "cashEntry.edit", "manualJournal.edit", "closing.lockPeriod"] as const) {
      expect(fin.has(k), k).toBe(true);
    }
  });
});

describe("Super Admin vs Admin", () => {
  const sys = (key: string) => new Set(permissionsOfRole({ key, isSystem: true, permissions: [] }));

  it("Super Admin memegang semua izin, termasuk Role Management", () => {
    const s = sys("SUPER_ADMIN");
    expect(s.size).toBe(ALL_PERMISSION_KEYS.length);
    for (const k of SUPER_ADMIN_ONLY) expect(s.has(k)).toBe(true);
  });

  it("Admin memegang semua izin kecuali Role Management", () => {
    const a = sys("ADMIN");
    expect(a.size).toBe(ALL_PERMISSION_KEYS.length - SUPER_ADMIN_ONLY.length);
    for (const k of SUPER_ADMIN_ONLY) expect(a.has(k)).toBe(false);
    expect(a.has("users.manage")).toBe(true);
    expect(a.has("closing.lockPeriod")).toBe(true);
  });

  it("izin role sistem tidak terpengaruh isi kolom permissions di DB", () => {
    expect(permissionsOfRole({ key: "ADMIN", isSystem: true, permissions: ["roles.manage"] })).not.toContain("roles.manage");
    expect(permissionsOfRole({ key: "SUPER_ADMIN", isSystem: true, permissions: [] })).toContain("roles.manage");
  });

  it("role kustom bernama SUPER_ADMIN tanpa isSystem tidak mendapat Role Management", () => {
    expect(permissionsOfRole({ key: "SUPER_ADMIN", isSystem: false, permissions: ["roles.manage", "roles.view"] })).toEqual([]);
  });

  it("role kustom tidak bisa memegang roles.view / roles.manage", () => {
    expect(normalizeCustomPermissions(["roles.manage", "roles.view", "dashboard.view"])).toEqual(["dashboard.view"]);
    for (const r of DEFAULT_ROLES) for (const k of SUPER_ADMIN_ONLY) expect(normalizeCustomPermissions(r.permissions)).not.toContain(k);
  });

  it("editor role kustom tidak menampilkan modul Role Management", () => {
    const keys = EDITABLE_PERMISSION_GROUPS.flatMap((g) => g.modules.flatMap((m) => m.perms.map((p) => p.key)));
    for (const k of SUPER_ADMIN_ONLY) expect(keys).not.toContain(k);
    expect(keys.length).toBe(ALL_PERMISSION_KEYS.length - SUPER_ADMIN_ONLY.length);
    expect(PERMISSION_GROUPS.flatMap((g) => g.modules).some((m) => m.key === "roles")).toBe(true);
  });

  it("holderHasPerm tidak punya jalan pintas: hanya set izin yang dihitung", () => {
    expect(holderHasPerm({ permissions: sys("ADMIN") }, "roles.view")).toBe(false);
    expect(holderHasPerm({ permissions: sys("SUPER_ADMIN") }, "roles.view")).toBe(true);
    expect(holderHasPerm(null, "dashboard.view")).toBe(false);
  });
});
