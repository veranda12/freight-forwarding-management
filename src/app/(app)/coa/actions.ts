"use server";

import { revalidatePath } from "next/cache";
import type { AccountType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/auth-helpers";
import { writeAudit } from "@/lib/audit";

const TYPES: AccountType[] = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"];

/** Tambah akun COA. Saldo normal mengikuti tipe akun. */
export async function createCoaAction(input: { code: string; name: string; type: string; parentId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await assertCan("coa", "write");
  const code = input.code.trim();
  const name = input.name.trim();
  if (!/^\d{3,6}$/.test(code)) return { ok: false, error: "Kode akun harus 3 sampai 6 angka." };
  if (name.length < 3) return { ok: false, error: "Nama akun minimal 3 karakter." };
  const type = input.type as AccountType;
  if (!TYPES.includes(type)) return { ok: false, error: "Tipe akun tidak valid." };
  if (await prisma.coaAccount.findUnique({ where: { code } })) return { ok: false, error: `Kode ${code} sudah dipakai.` };
  const acc = await prisma.coaAccount.create({
    data: { code, name, type, normalBalance: type === "ASSET" || type === "EXPENSE" ? "DEBIT" : "CREDIT", parentId: input.parentId || null, isPostable: true },
  });
  await writeAudit({ entity: "CoaAccount", entityId: acc.id, action: "CREATE", summary: `${code} ${name}`, userId: user.id });
  revalidatePath("/coa");
  return { ok: true };
}
