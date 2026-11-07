import { describe, it, expect } from "vitest";
import { can, resourcesForRole } from "@/lib/rbac";

describe("RBAC — can()", () => {
  it("ADMIN boleh segalanya", () => {
    expect(can("ADMIN", "accounting", "write")).toBe(true);
    expect(can("ADMIN", "users", "write")).toBe(true);
    expect(can("ADMIN", "jobs", "write")).toBe(true);
  });

  it("MANAGEMENT read-only semua, tidak boleh write", () => {
    expect(can("MANAGEMENT", "accounting", "read")).toBe(true);
    expect(can("MANAGEMENT", "jobs", "read")).toBe(true);
    expect(can("MANAGEMENT", "jobs", "write")).toBe(false);
    expect(can("MANAGEMENT", "invoices", "write")).toBe(false);
  });

  it("SALES tidak boleh akses accounting, boleh quotation", () => {
    expect(can("SALES", "accounting", "read")).toBe(false);
    expect(can("SALES", "quotations", "write")).toBe(true);
    expect(can("SALES", "customers", "write")).toBe(true);
  });

  it("FINANCE boleh invoice & accounting, tidak boleh tulis job", () => {
    expect(can("FINANCE", "invoices", "write")).toBe(true);
    expect(can("FINANCE", "accounting", "read")).toBe(true);
    expect(can("FINANCE", "jobs", "write")).toBe(false);
  });

  it("OPERATION boleh tulis job & booking", () => {
    expect(can("OPERATION", "jobs", "write")).toBe(true);
    expect(can("OPERATION", "bookings", "write")).toBe(true);
  });

  it("Cari Bukti: baca saja untuk FINANCE dan SALES, tidak untuk OPERATION", () => {
    expect(can("FINANCE", "proofs", "read")).toBe(true);
    expect(can("SALES", "proofs", "read")).toBe(true);
    expect(can("OPERATION", "proofs", "read")).toBe(false);
    expect(can("FINANCE", "proofs", "write")).toBe(false);
  });

  it("write menyiratkan read", () => {
    // SALES bisa write quotations → otomatis bisa read
    expect(can("SALES", "quotations", "read")).toBe(true);
  });

  it("role tanpa akses dapat daftar resource kosong-terbatas", () => {
    const mgmt = resourcesForRole("MANAGEMENT");
    expect(mgmt).toContain("dashboard");
    expect(mgmt).toContain("accounting");
    const sales = resourcesForRole("SALES");
    expect(sales).toContain("quotations");
    expect(sales).not.toContain("accounting");
  });
});
