import { describe, it, expect } from "vitest";
import { validateUserInput } from "@/lib/users";

const base = { name: "Rina Sari", email: "  Rina@Perusahaan.co.id ", phone: "+62 812 3456 7890", roleId: "role_sales", password: "rahasia123", confirmPassword: "rahasia123" };

describe("validateUserInput", () => {
  it("menerima input lengkap dan menormalisasi email serta nama", () => {
    const v = validateUserInput(base);
    expect(v.email).toBe("rina@perusahaan.co.id");
    expect(v.name).toBe("Rina Sari");
    expect(v.roleId).toBe("role_sales");
    expect(v.phone).toBe("+62 812 3456 7890");
  });

  it("telepon boleh kosong dan menjadi null", () => {
    expect(validateUserInput({ ...base, phone: "" }).phone).toBeNull();
    expect(validateUserInput({ ...base, phone: undefined }).phone).toBeNull();
  });

  it("menolak nama terlalu pendek", () => {
    expect(() => validateUserInput({ ...base, name: " A " })).toThrow(/Nama/);
  });

  it("menolak email tidak valid", () => {
    expect(() => validateUserInput({ ...base, email: "rina@" })).toThrow(/email/);
    expect(() => validateUserInput({ ...base, email: "rina sari@x.co" })).toThrow(/email/);
  });

  it("menolak telepon dengan huruf", () => {
    expect(() => validateUserInput({ ...base, phone: "0812-abc-7890" })).toThrow(/Nomor telepon/);
  });

  it("menolak role kosong", () => {
    expect(() => validateUserInput({ ...base, roleId: "" })).toThrow(/Role wajib/);
    expect(() => validateUserInput({ ...base, roleId: "   " })).toThrow(/Role wajib/);
  });

  it("menolak password pendek dan konfirmasi yang tidak sama", () => {
    expect(() => validateUserInput({ ...base, password: "abc123", confirmPassword: "abc123" })).toThrow(/minimal 8/);
    expect(() => validateUserInput({ ...base, confirmPassword: "rahasia124" })).toThrow(/Konfirmasi/);
  });

  it("menolak password lebih dari 72 byte", () => {
    const long = "a".repeat(73);
    expect(() => validateUserInput({ ...base, password: long, confirmPassword: long })).toThrow(/72 byte/);
  });
});
