"use server";

import fs from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/auth-helpers";
import { writeAudit } from "@/lib/audit";
import { errorMessage } from "@/lib/action-error";

export type CompanyInput = {
  name: string; legalName: string; npwp: string; address: string; city: string; phone: string; email: string; website: string;
  bankName: string; bankAccount: string; bankHolder: string; bankBranch: string; signatoryName: string; signatoryTitle: string;
};
type Result = { ok: true } | { ok: false; error: string };

const LOGO_DIR = path.join(process.cwd(), "public", "uploads", "company");
const LOGO_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg" };
const LOGO_MAX = 800 * 1024;

function parse(input: CompanyInput) {
  const name = input.name.trim();
  if (!name) throw new Error("Nama perusahaan wajib diisi.");
  const email = input.email.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Format email tidak valid.");
  const opt = (v: string) => v.trim() || null;
  return {
    name, legalName: opt(input.legalName), npwp: opt(input.npwp), address: opt(input.address), city: opt(input.city),
    phone: opt(input.phone), email: email || null, website: opt(input.website),
    bankName: opt(input.bankName), bankAccount: opt(input.bankAccount), bankHolder: opt(input.bankHolder), bankBranch: opt(input.bankBranch),
    signatoryName: opt(input.signatoryName), signatoryTitle: opt(input.signatoryTitle),
  };
}

export async function saveCompanySettingAction(input: CompanyInput): Promise<Result> {
  const user = await assertCan("settings", "write");
  try {
    const data = parse(input);
    const current = await prisma.companySetting.findFirst();
    const c = current
      ? await prisma.companySetting.update({ where: { id: current.id }, data })
      : await prisma.companySetting.create({ data });
    await writeAudit({ entity: "CompanySetting", entityId: c.id, action: current ? "UPDATE" : "CREATE", summary: c.name, userId: user.id });
  } catch (e) {
    return { ok: false, error: errorMessage(e, "Gagal menyimpan setting perusahaan.") };
  }
  revalidatePath("/settings");
  return { ok: true };
}

async function removeLogoFile(logoPath: string | null) {
  // Hanya hapus file logo yang dikelola halaman ini.
  if (!logoPath?.startsWith("/uploads/company/")) return;
  await fs.rm(path.join(process.cwd(), "public", logoPath.replace(/^\/+/, "")), { force: true });
}

/** Unggah logo kop invoice (PNG/JPG, maks 800 KB). Logo lama dihapus. */
export async function uploadCompanyLogoAction(form: FormData): Promise<Result> {
  const user = await assertCan("settings", "write");
  try {
    const file = form.get("logo");
    if (!(file instanceof File) || file.size === 0) throw new Error("Pilih file logo.");
    const ext = LOGO_TYPES[file.type];
    if (!ext) throw new Error("Logo harus PNG atau JPG.");
    if (file.size > LOGO_MAX) throw new Error("Ukuran logo maksimal 800 KB.");
    const current = await prisma.companySetting.findFirst();
    if (!current) throw new Error("Simpan identitas perusahaan dulu.");

    await fs.mkdir(LOGO_DIR, { recursive: true });
    const name = `logo-${Date.now()}.${ext}`;
    await fs.writeFile(path.join(LOGO_DIR, name), Buffer.from(await file.arrayBuffer()));
    await prisma.companySetting.update({ where: { id: current.id }, data: { logoPath: `/uploads/company/${name}` } });
    await removeLogoFile(current.logoPath);
    await writeAudit({ entity: "CompanySetting", entityId: current.id, action: "UPDATE", summary: "Logo diganti", userId: user.id });
  } catch (e) {
    return { ok: false, error: errorMessage(e, "Gagal mengunggah logo.") };
  }
  revalidatePath("/settings");
  return { ok: true };
}

export async function removeCompanyLogoAction(): Promise<Result> {
  const user = await assertCan("settings", "write");
  try {
    const current = await prisma.companySetting.findFirst();
    if (!current?.logoPath) return { ok: true };
    await prisma.companySetting.update({ where: { id: current.id }, data: { logoPath: null } });
    await removeLogoFile(current.logoPath);
    await writeAudit({ entity: "CompanySetting", entityId: current.id, action: "UPDATE", summary: "Logo dihapus", userId: user.id });
  } catch (e) {
    return { ok: false, error: errorMessage(e, "Gagal menghapus logo.") };
  }
  revalidatePath("/settings");
  return { ok: true };
}
