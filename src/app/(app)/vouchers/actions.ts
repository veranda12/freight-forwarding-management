"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertNotOwn, assertPerm } from "@/lib/auth-helpers";
import { voucherScope } from "@/lib/data-scope";
import { assertCostingLinesInScope } from "../jobs/job-scope";
import { writeAudit } from "@/lib/audit";
import { cancelVoucher, createVoucher, payVoucher, type VoucherInput, type VoucherPayment } from "@/lib/vouchers";
import { errorMessage } from "@/lib/action-error";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: errorMessage(e, "Gagal.") });

async function voucherInScope(user: Awaited<ReturnType<typeof assertPerm>>, voucherId: string) {
  const v = await prisma.voucher.findFirst({ where: { id: voucherId, ...voucherScope(user) }, select: { createdById: true } });
  if (!v) throw new Error("Data tidak ditemukan.");
  return v;
}

function refresh(jobId?: string) {
  revalidatePath("/vouchers");
  revalidatePath("/accounting");
  if (jobId) revalidatePath(`/costing/${jobId}`);
}

export async function createVoucherAction(input: VoucherInput): Promise<Result<{ id: string }>> {
  const user = await assertPerm("vouchers.create");
  try {
    await assertCostingLinesInScope(user, input.lineIds);
    const id = await createVoucher(prisma, input, user.id);
    await writeAudit({ entity: "Voucher", entityId: id, action: "CREATE", summary: input.payee, userId: user.id });
    refresh(input.jobId);
    return { ok: true, id };
  } catch (e) { return fail(e); }
}

export async function payVoucherAction(voucherId: string, input: VoucherPayment): Promise<Result<{ number: string }>> {
  const user = await assertPerm("vouchers.pay");
  try {
    await voucherInScope(user, voucherId);
    const r = await payVoucher(prisma, voucherId, input, user.id);
    await writeAudit({ entity: "Voucher", entityId: voucherId, action: "PAY", summary: r.number, userId: user.id });
    refresh();
    return { ok: true, number: r.number };
  } catch (e) { return fail(e); }
}

export async function cancelVoucherAction(voucherId: string, reason: string): Promise<Result> {
  const user = await assertPerm("vouchers.cancel");
  try {
    const v = await voucherInScope(user, voucherId);
    assertNotOwn(user, "vouchers.cancelOwn", [v.createdById], "membatalkan");
    const r = await cancelVoucher(prisma, voucherId, reason);
    await writeAudit({ entity: "Voucher", entityId: voucherId, action: "CANCEL", summary: `${r.number}: ${reason}`, userId: user.id });
    refresh(r.jobId);
    return { ok: true };
  } catch (e) { return fail(e); }
}
