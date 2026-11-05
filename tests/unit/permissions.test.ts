import { describe, it, expect } from "vitest";
import { ALL_PERMISSIONS, ALL_PERMISSION_KEYS, DEFAULT_ROLES, PERMISSION_GROUPS, isPermissionKey, normalizePermissions } from "@/lib/permissions";
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

  it("Operation mengirim, memutuskan, dan mengonversi quotation", () => {
    const o = role("OPERATION");
    for (const k of ["quotations.viewAll", "quotations.send", "quotations.decide", "quotations.return", "quotations.convert"]) expect(o.has(k as never), k).toBe(true);
    expect(o.has("quotations.create" as never)).toBe(false);
  });

  it("Management hanya melihat (tanpa aksi); maker-checker quotation aktif bawaan", () => {
    const actionKinds = new Set(["action", "approve", "own"]);
    const allowedExtra = new Set(["reports.export", "invoices.print", "documents.generate", "domestic.print"]);
    for (const k of role("MANAGEMENT")) {
      const def = ALL_PERMISSIONS.find((p) => p.key === k)!;
      if (actionKinds.has(def.kind)) expect(allowedExtra.has(k), k).toBe(true);
    }
    // Maker-checker quotation (aturan bisnis yang diminta) aktif bawaan: tidak ada role awal yang memegang decideOwn.
    for (const r of DEFAULT_ROLES) expect(normalizePermissions(r.permissions)).not.toContain("quotations.decideOwn");
    // Pembatalan dokumen keuangan/STT buatan sendiri tetap boleh seperti sebelumnya (bisa dicabut admin).
    expect(role("FINANCE").has("invoices.cancelOwn" as never)).toBe(true);
    expect(role("OPERATION").has("domestic.cancelOwn" as never)).toBe(true);
  });
});
