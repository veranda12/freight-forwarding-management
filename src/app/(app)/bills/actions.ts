"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/auth-helpers";
import { writeAudit } from "@/lib/audit";
import { createBillFromJobCore, recordVendorPaymentCore, type BillOpts, type VendorPaymentInput } from "@/lib/payables";
import { errorMessage } from "@/lib/action-error";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: errorMessage(e, "Gagal.") });

/** Membuat vendor bill dari biaya beli job untuk satu vendor. */
export async function createBillFromJobAction(jobId: string, vendorId: string, opts: BillOpts = {}): Promise<Result<{ id: string }>> {
  const user = await assertCan("bills", "write");
  try {
    const id = await createBillFromJobCore(prisma, jobId, vendorId, user.id, opts);
    const bill = await prisma.vendorBill.findUnique({ where: { id }, select: { number: true } });
    await writeAudit({ entity: "VendorBill", entityId: id, action: "CREATE_FROM_JOB", summary: bill?.number ?? id, userId: user.id });
    revalidatePath(`/jobs/${jobId}`);
    revalidatePath("/bills");
    revalidatePath("/accounting");
    return { ok: true, id };
  } catch (e) { return fail(e); }
}

/** Mencatat pembayaran ke vendor (IDR, atau valas dengan kurs pembayaran). */
export async function recordVendorPaymentAction(billId: string, input: VendorPaymentInput): Promise<Result> {
  const user = await assertCan("payments", "write");
  try {
    await recordVendorPaymentCore(prisma, billId, input, user.id);
    const bill = await prisma.vendorBill.findUnique({ where: { id: billId }, select: { number: true, currency: true } });
    const summary = bill?.currency && bill.currency !== "IDR"
      ? `${bill.number}: ${bill.currency} ${input.amountForeign ?? 0}`
      : `${bill?.number ?? billId}: Rp ${Number(input.amount ?? 0).toLocaleString("id-ID")}`;
    await writeAudit({ entity: "VendorBill", entityId: billId, action: "PAYMENT", summary, userId: user.id });
    revalidatePath("/bills");
    revalidatePath("/payments");
    revalidatePath("/accounting");
    return { ok: true };
  } catch (e) { return fail(e); }
}
