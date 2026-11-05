import type { Prisma } from "@prisma/client";
import { hasPerm, type SessionUser } from "./auth-helpers";

/**
 * Batas data per modul. User dengan izin `<modul>.viewAll` melihat semua data; selain itu hanya data "miliknya":
 * ia Sales PIC atau pembuat dokumen (data lama tanpa pembuat dinilai dari Sales PIC). Dokumen turunan (invoice, bill,
 * pembayaran, booking, dokumen) ikut pemilik job/STT/customer-nya.
 *
 * Setiap fungsi mengembalikan filter Prisma; `{}` berarti tanpa batas. Pakai di SEMUA daftar, detail (lewat
 * `findFirst({ where: { id, ...scope } })`), pencarian, dashboard, laporan, PDF, dan export.
 */

type U = Pick<SessionUser, "id" | "isAdmin" | "permissions">;

const ownJob = (uid: string): Prisma.JobWhereInput => ({ OR: [{ salesPicId: uid }, { createdById: uid }] });
const ownDomestic = (uid: string): Prisma.DomesticShipmentWhereInput => ({ OR: [{ createdById: uid }, { customer: { salesPicId: uid } }] });
const ownInvoice = (uid: string): Prisma.InvoiceWhereInput => ({
  OR: [{ createdById: uid }, { job: ownJob(uid) }, { domesticShipment: ownDomestic(uid) }, { customer: { salesPicId: uid } }],
});
const ownBill = (uid: string): Prisma.VendorBillWhereInput => ({ OR: [{ createdById: uid }, { job: ownJob(uid) }] });

export function customerScope(u: U): Prisma.CustomerWhereInput {
  return hasPerm(u as SessionUser, "customers.viewAll") ? {} : { OR: [{ salesPicId: u.id }, { createdById: u.id }] };
}

export function quotationScope(u: U): Prisma.QuotationWhereInput {
  return hasPerm(u as SessionUser, "quotations.viewAll") ? {} : { OR: [{ ownerId: u.id }, { createdById: u.id }] };
}

export function jobScope(u: U): Prisma.JobWhereInput {
  return hasPerm(u as SessionUser, "jobs.viewAll") ? {} : ownJob(u.id);
}

export function domesticScope(u: U): Prisma.DomesticShipmentWhereInput {
  return hasPerm(u as SessionUser, "domestic.viewAll") ? {} : ownDomestic(u.id);
}

export function invoiceScope(u: U): Prisma.InvoiceWhereInput {
  return hasPerm(u as SessionUser, "invoices.viewAll") ? {} : ownInvoice(u.id);
}

export function billScope(u: U): Prisma.VendorBillWhereInput {
  return hasPerm(u as SessionUser, "bills.viewAll") ? {} : ownBill(u.id);
}

export function paymentScope(u: U): Prisma.PaymentWhereInput {
  if (hasPerm(u as SessionUser, "payments.viewAll")) return {};
  return {
    OR: [
      { createdById: u.id },
      { allocations: { some: { invoice: ownInvoice(u.id) } } },
      { allocations: { some: { bill: ownBill(u.id) } } },
    ],
  };
}

export function noteScope(u: U): Prisma.NoteWhereInput {
  return hasPerm(u as SessionUser, "notes.viewAll") ? {} : { createdById: u.id };
}

/** Gabungkan filter tambahan dengan batas data (aman bila salah satunya kosong). */
export function and<T extends object>(...parts: (T | undefined)[]): T {
  const xs = parts.filter((p): p is T => !!p && Object.keys(p).length > 0);
  if (xs.length === 0) return {} as T;
  if (xs.length === 1) return xs[0];
  return { AND: xs } as unknown as T;
}
