import bcrypt from "bcryptjs";
import { Role, type PrismaClient } from "@prisma/client";

export type UserInput = {
  name: string;
  email: string;
  phone?: string | null;
  role: string;
  password: string;
  confirmPassword?: string;
};

const ROLES = Object.values(Role) as string[];

/** Validasi murni input user baru. Email disimpan huruf kecil, password tidak pernah disimpan mentah. */
export function validateUserInput(input: UserInput) {
  const name = (input.name ?? "").trim();
  if (name.length < 2 || name.length > 80) throw new Error("Nama wajib diisi, 2 sampai 80 karakter.");

  const email = (input.email ?? "").trim().toLowerCase();
  if (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Format email tidak valid.");

  const phone = (input.phone ?? "").trim();
  if (phone && !/^\+?[0-9 ()-]{8,20}$/.test(phone)) {
    throw new Error("Nomor telepon hanya boleh angka, spasi, tanda +, (, ), dan -, 8 sampai 20 karakter.");
  }

  if (!ROLES.includes(input.role)) throw new Error("Role tidak dikenal.");

  const password = input.password ?? "";
  if (password.length < 8) throw new Error("Password minimal 8 karakter.");
  if (Buffer.byteLength(password, "utf8") > 72) throw new Error("Password maksimal 72 byte.");
  if (input.confirmPassword !== undefined && input.confirmPassword !== password) {
    throw new Error("Konfirmasi password tidak sama.");
  }

  return { name, email, phone: phone || null, role: input.role as Role, password };
}

/** Membuat user baru dengan password yang di-hash. Email harus unik. */
export async function createUser(db: PrismaClient, input: UserInput) {
  const v = validateUserInput(input);
  const dup = await db.user.findUnique({ where: { email: v.email }, select: { id: true } });
  if (dup) throw new Error("Email sudah terdaftar.");
  const passwordHash = await bcrypt.hash(v.password, 10);
  return db.user.create({
    data: { name: v.name, email: v.email, phone: v.phone, role: v.role, passwordHash, isActive: true },
    select: { id: true, name: true, email: true, role: true },
  });
}
