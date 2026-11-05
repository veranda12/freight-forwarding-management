"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertPerm } from "@/lib/auth-helpers";
import { customerScope } from "@/lib/data-scope";
import { writeAudit } from "@/lib/audit";
import { errorMessage } from "@/lib/action-error";

export type WarehouseInput = { name: string; address: string; city: string; distanceKm: string; isActive: boolean };
type Result = { ok: true } | { ok: false; error: string };

function parse(input: WarehouseInput) {
  const name = input.name.trim();
  const address = input.address.trim();
  if (!name) throw new Error("Nama gudang wajib diisi.");
  if (!address) throw new Error("Alamat gudang wajib diisi.");
  const km = input.distanceKm.trim() === "" ? null : Number(input.distanceKm);
  if (km != null && !(km >= 0)) throw new Error("Jarak harus angka 0 atau lebih.");
  return { name, address, city: input.city.trim() || null, distanceKm: km == null ? null : new Prisma.Decimal(km), isActive: input.isActive };
}

/** Tambah gudang tujuan milik customer. */
export async function createWarehouseAction(customerId: string, input: WarehouseInput): Promise<Result> {
  const user = await assertPerm("customers.edit");
  try {
    const own = await prisma.customer.findFirst({ where: { id: customerId, ...customerScope(user) }, select: { id: true } });
    if (!own) throw new Error("Customer tidak ditemukan.");
    const w = await prisma.warehouse.create({ data: { customerId, ...parse(input) } });
    await writeAudit({ entity: "Warehouse", entityId: w.id, action: "CREATE", summary: w.name, userId: user.id });
  } catch (e) {
    return { ok: false, error: errorMessage(e, "Gagal menambah gudang.") };
  }
  revalidatePath(`/customers/${customerId}`);
  return { ok: true };
}

/** Ubah gudang. Job yang sudah memakai gudang ini menyimpan alamat dan jaraknya sendiri. */
export async function updateWarehouseAction(id: string, input: WarehouseInput): Promise<Result> {
  const user = await assertPerm("customers.edit");
  try {
    const cur = await prisma.warehouse.findFirst({ where: { id, customer: customerScope(user) }, select: { id: true } });
    if (!cur) throw new Error("Gudang tidak ditemukan.");
    const w = await prisma.warehouse.update({ where: { id }, data: parse(input) });
    await writeAudit({ entity: "Warehouse", entityId: id, action: "UPDATE", summary: w.name, userId: user.id });
    revalidatePath(`/customers/${w.customerId}`);
  } catch (e) {
    return { ok: false, error: errorMessage(e, "Gagal mengubah gudang.") };
  }
  return { ok: true };
}
