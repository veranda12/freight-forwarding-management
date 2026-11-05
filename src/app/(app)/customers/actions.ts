"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertPerm } from "@/lib/auth-helpers";
import { customerScope } from "@/lib/data-scope";
import { writeAudit } from "@/lib/audit";
import { customerSchema, type CustomerInput } from "@/lib/validators";
import { Prisma } from "@prisma/client";

async function nextCustomerCode(): Promise<string> {
  const last = await prisma.customer.findFirst({ orderBy: { code: "desc" }, where: { code: { startsWith: "CUST" } }, select: { code: true } });
  const n = last ? parseInt(last.code.replace("CUST", ""), 10) + 1 : 1;
  return `CUST${String(n).padStart(4, "0")}`;
}

function clean(v?: string) { return v && v.trim() !== "" ? v.trim() : null; }

export async function createCustomer(input: CustomerInput): Promise<{ ok: boolean; id?: string; error?: string }> {
  const user = await assertPerm("customers.create");
  const parsed = customerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Data tidak valid" };
  const d = parsed.data;
  const code = await nextCustomerCode();
  const c = await prisma.customer.create({
    data: {
      code, name: d.name, npwp: clean(d.npwp), industry: clean(d.industry),
      address: clean(d.address), city: clean(d.city), phone: clean(d.phone), email: clean(d.email),
      termOfPayment: d.termOfPayment, creditLimit: new Prisma.Decimal(d.creditLimit),
      salesPicId: clean(d.salesPicId) ?? undefined,
      createdById: user.id,
      ...(clean(d.contactName) ? { contacts: { create: [{ name: d.contactName!, position: clean(d.contactPosition), phone: clean(d.contactPhone), email: clean(d.contactEmail), isPrimary: true }] } } : {}),
    },
  });
  await writeAudit({ entity: "Customer", entityId: c.id, action: "CREATE", summary: c.name, userId: user.id });
  revalidatePath("/customers");
  return { ok: true, id: c.id };
}

export async function updateCustomer(id: string, input: CustomerInput): Promise<{ ok: boolean; error?: string }> {
  const user = await assertPerm("customers.edit");
  const inScope = await prisma.customer.findFirst({ where: { id, ...customerScope(user) }, select: { id: true } });
  if (!inScope) return { ok: false, error: "Customer tidak ditemukan." };
  const parsed = customerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Data tidak valid" };
  const d = parsed.data;
  await prisma.customer.update({
    where: { id },
    data: {
      name: d.name, npwp: clean(d.npwp), industry: clean(d.industry),
      address: clean(d.address), city: clean(d.city), phone: clean(d.phone), email: clean(d.email),
      termOfPayment: d.termOfPayment, creditLimit: new Prisma.Decimal(d.creditLimit),
      salesPicId: clean(d.salesPicId) ?? null,
    },
  });
  await writeAudit({ entity: "Customer", entityId: id, action: "UPDATE", summary: d.name, userId: user.id });
  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  return { ok: true };
}
