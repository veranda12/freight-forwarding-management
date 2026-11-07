"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma, type QuotationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertPerm, assertNotOwn, hasPerm, ForbiddenError, type SessionUser } from "@/lib/auth-helpers";
import { quotationScope, customerScope } from "@/lib/data-scope";
import { errorMessage } from "@/lib/action-error";
import { writeAudit } from "@/lib/audit";
import { genJobNumber } from "@/lib/sequence";
import { modeDirKey } from "@/lib/enums";
import { resolveBuyingSource } from "@/lib/quote-source";
import { resolveQuotationRoute } from "@/lib/route-match";

const r2 = (n: number) => Math.round(n * 100) / 100;

type QuoLineInput = { chargeCodeId: string; qty: number; buyingPrice: number; sellingPrice: number; taxable: boolean; costSource?: string; vendorId?: string | null; vehicleId?: string | null };
type QuoInput = {
  customerId: string; ownerId?: string; mode: string; direction: string;
  currency: string; exchangeRate: number; validUntil: string; incoterm?: string;
  originText?: string; destText?: string; notes?: string; lines: QuoLineInput[];
};

export async function createQuotation(input: QuoInput): Promise<{ ok: boolean; error?: string; id?: string }> {
  let user: SessionUser;
  try {
    user = await assertPerm("quotations.create");
    if (!input.customerId) throw new Error("Customer wajib dipilih.");
    const cust = await prisma.customer.findFirst({ where: { id: input.customerId, ...customerScope(user) }, select: { id: true } });
    if (!cust) throw new Error("Customer tidak ditemukan.");
  } catch (e) { return { ok: false, error: errorMessage(e, "Gagal membuat quotation.") }; }
  const lines = (input.lines ?? []).filter((l) => l.chargeCodeId);
  if (lines.length === 0) return { ok: false, error: "Minimal satu baris charge." };

  const fx = Number(input.exchangeRate) || 1;
  let totalSell = 0, totalBuy = 0;
  for (const l of lines) {
    totalSell += r2(Number(l.qty) * Number(l.sellingPrice) * fx);
    totalBuy += r2(Number(l.qty) * Number(l.buyingPrice) * fx);
  }
  totalSell = r2(totalSell); totalBuy = r2(totalBuy);
  const margin = r2(totalSell - totalBuy);
  const marginPct = totalSell > 0 ? r2((margin / totalSell) * 100) : 0;

  const id = await prisma.$transaction(async (tx) => {
    const { genDocNumber, SEQ } = await import("@/lib/sequence");
    const number = await genDocNumber(tx, SEQ.QUOTATION);
    const validUntil = input.validUntil ? new Date(input.validUntil) : new Date(Date.now() + 30 * 86400000);
    const quo = await tx.quotation.create({
      data: {
        number, customerId: input.customerId, ownerId: input.ownerId || user.id, createdById: user.id,
        mode: input.mode as any, direction: input.direction as any,
        currency: input.currency || "USD", exchangeRate: new Prisma.Decimal(fx),
        validUntil, status: "DRAFT", incoterm: input.incoterm || null,
        originText: input.originText || null, destText: input.destText || null, notes: input.notes || null,
        totalSelling: new Prisma.Decimal(totalSell), totalBuying: new Prisma.Decimal(totalBuy),
        marginAmount: new Prisma.Decimal(margin), marginPct: new Prisma.Decimal(marginPct),
        needsApproval: totalSell > 0 && margin / totalSell < 0.1,
        lines: {
          create: lines.map((l, i) => ({
            chargeCodeId: l.chargeCodeId, currency: input.currency || "USD",
            exchangeRate: new Prisma.Decimal(fx), qty: new Prisma.Decimal(Number(l.qty) || 1),
            buyingPrice: new Prisma.Decimal(Number(l.buyingPrice) || 0),
            sellingPrice: new Prisma.Decimal(Number(l.sellingPrice) || 0),
            taxable: !!l.taxable, sortOrder: i,
            ...resolveBuyingSource(l),
          })),
        },
      },
    });
    return quo.id;
  });

  await writeAudit({ entity: "Quotation", entityId: id, action: "CREATE", userId: user.id });
  revalidatePath("/quotations");
  return { ok: true, id };
}

type Result = { ok: true } | { ok: false; error: string };
const fail = (e: unknown, fallback: string): Result => ({ ok: false, error: errorMessage(e, fallback) });

/** Quotation dalam batas data user, atau error (diperlakukan seperti tidak ada). */
async function quotationInScope(user: SessionUser, id: string) {
  const quo = await prisma.quotation.findFirst({
    where: { id, ...quotationScope(user) },
    select: { id: true, number: true, status: true, needsApproval: true, createdById: true, ownerId: true, submittedById: true, sentById: true },
  });
  if (!quo) throw new Error("Quotation tidak ditemukan.");
  return quo;
}

/** Ubah status hanya bila status saat ini masih `from` (aman dari klik ganda / dua user bersamaan). */
async function transition(id: string, from: QuotationStatus, data: Prisma.QuotationUpdateManyMutationInput) {
  const res = await prisma.quotation.updateMany({ where: { id, status: from }, data });
  if (res.count === 0) throw new Error("Status quotation sudah berubah. Muat ulang halaman.");
}

async function done(user: SessionUser, id: string, action: string, summary?: string): Promise<Result> {
  await writeAudit({ entity: "Quotation", entityId: id, action, summary, userId: user.id });
  revalidatePath(`/quotations/${id}`);
  revalidatePath("/quotations");
  return { ok: true };
}

/** Sales: Draft → Diajukan. */
export async function submitQuotation(id: string): Promise<Result> {
  try {
    const user = await assertPerm("quotations.submit");
    const quo = await quotationInScope(user, id);
    if (quo.status !== "DRAFT") throw new Error("Hanya quotation Draft yang bisa diajukan.");
    await transition(id, "DRAFT", { status: "SUBMITTED", submittedById: user.id, submittedAt: new Date(), returnNote: null });
    return done(user, id, "SUBMIT", quo.number);
  } catch (e) { return fail(e, "Gagal mengajukan quotation."); }
}

/** Operation: Diajukan → Draft dengan catatan revisi. */
export async function returnQuotation(id: string, note: string): Promise<Result> {
  try {
    const user = await assertPerm("quotations.return");
    const why = (note ?? "").trim();
    if (why.length < 3) throw new Error("Catatan revisi wajib diisi (minimal 3 karakter).");
    const quo = await quotationInScope(user, id);
    if (quo.status !== "SUBMITTED") throw new Error("Hanya quotation berstatus Diajukan yang bisa dikembalikan.");
    assertNotOwn(user, "quotations.decideOwn", [quo.createdById, quo.submittedById], "mengembalikan");
    await transition(id, "SUBMITTED", { status: "DRAFT", returnNote: why, submittedById: null, submittedAt: null });
    return done(user, id, "RETURN", why);
  } catch (e) { return fail(e, "Gagal mengembalikan quotation."); }
}

/** Operation: Diajukan → Sent. Margin < 10% butuh izin tambahan. */
export async function sendQuotation(id: string): Promise<Result> {
  try {
    const user = await assertPerm("quotations.send");
    const quo = await quotationInScope(user, id);
    if (quo.status !== "SUBMITTED") throw new Error("Hanya quotation berstatus Diajukan yang bisa dikirim.");
    if (quo.needsApproval && !hasPerm(user, "quotations.sendLowMargin")) {
      throw new ForbiddenError("Margin quotation di bawah 10%: perlu user yang berwenang mengirim quotation margin rendah.");
    }
    assertNotOwn(user, "quotations.decideOwn", [quo.createdById, quo.submittedById], "mengirim");
    await transition(id, "SUBMITTED", { status: "SENT", sentById: user.id, sentAt: new Date(), ...(quo.needsApproval ? { approvedById: user.id, approvedAt: new Date() } : {}) });
    return done(user, id, "SEND", quo.number);
  } catch (e) { return fail(e, "Gagal mengirim quotation."); }
}

/** Operation: Sent → Accepted / Rejected (jawaban customer). */
export async function decideQuotation(id: string, decision: "ACCEPTED" | "REJECTED"): Promise<Result> {
  try {
    const user = await assertPerm("quotations.decide");
    if (decision !== "ACCEPTED" && decision !== "REJECTED") throw new Error("Keputusan tidak dikenal.");
    const quo = await quotationInScope(user, id);
    if (quo.status !== "SENT") throw new Error("Hanya quotation berstatus Sent yang bisa diterima atau ditolak.");
    assertNotOwn(user, "quotations.decideOwn", [quo.createdById, quo.submittedById, quo.sentById], decision === "ACCEPTED" ? "menerima" : "menolak");
    await transition(id, "SENT", { status: decision, decidedById: user.id, decidedAt: new Date() });
    return done(user, id, decision === "ACCEPTED" ? "ACCEPT" : "REJECT", quo.number);
  } catch (e) { return fail(e, "Gagal menyimpan keputusan quotation."); }
}

/**
 * Convert quotation → job. Berhasil: redirect ke job. Gagal: mengembalikan pesan untuk ditampilkan (pesan error yang
 * dilempar server action disamarkan Next.js di production, jadi tidak dilempar).
 */
export async function convertQuotationToJob(quotationId: string): Promise<{ ok: false; error: string } | void> {
  let jobId: string;
  try {
    const user = await assertPerm("quotations.convert");
    await quotationInScope(user, quotationId);
    jobId = await convertQuotationCore(quotationId, user.id);
  } catch (e) {
    return { ok: false, error: errorMessage(e, "Gagal konversi ke job.") };
  }
  revalidatePath("/jobs");
  revalidatePath("/quotations");
  redirect(`/jobs/${jobId}`);
}

async function convertQuotationCore(quotationId: string, userId: string): Promise<string> {
  const quo = await prisma.quotation.findUnique({
    where: { id: quotationId },
    include: { lines: { include: { chargeCode: true } }, customer: true, job: true },
  });
  if (!quo) throw new Error("Quotation tidak ditemukan.");
  if (quo.job) return quo.job.id;
  if (quo.status !== "ACCEPTED") throw new Error("Quotation harus berstatus Diterima sebelum dikonversi ke job.");

  const jobId = await prisma.$transaction(async (tx) => {
    const modeDir = modeDirKey(quo.mode, quo.direction);
    const number = await genJobNumber(tx, modeDir);
    const route = await resolveQuotationRoute(tx, quo.mode, quo.originText, quo.destText);

    let revenue = 0, cost = 0;
    const costings: Prisma.CostingLineCreateManyJobInput[] = [];
    let order = 0;
    for (const ln of quo.lines) {
      const fx = Number(ln.exchangeRate);
      const qty = Number(ln.qty);
      const sell = Number(ln.sellingPrice);
      const buy = Number(ln.buyingPrice);
      const src = resolveBuyingSource(ln);
      const sellIdr = r2(qty * sell * fx);
      const buyIdr = r2(qty * buy * fx);
      revenue += sellIdr; cost += buyIdr;
      costings.push({
        side: "SELLING", chargeCodeId: ln.chargeCodeId, description: ln.chargeCode.code,
        currency: ln.currency, exchangeRate: ln.exchangeRate, qty: ln.qty, unitPrice: ln.sellingPrice,
        amountForeign: new Prisma.Decimal(r2(qty * sell)), estimatedIdr: new Prisma.Decimal(sellIdr),
        actualIdr: new Prisma.Decimal(sellIdr), taxable: ln.taxable, sortOrder: order++,
      });
      costings.push({
        side: "BUYING", chargeCodeId: ln.chargeCodeId, description: ln.chargeCode.code,
        vendorId: src.vendorId, vehicleId: src.vehicleId,
        currency: ln.currency, exchangeRate: ln.exchangeRate, qty: ln.qty, unitPrice: ln.buyingPrice,
        amountForeign: new Prisma.Decimal(r2(qty * buy)), estimatedIdr: new Prisma.Decimal(buyIdr),
        actualIdr: new Prisma.Decimal(buyIdr), taxable: ln.taxable, sortOrder: order++,
      });
    }
    revenue = r2(revenue); cost = r2(cost);
    const profit = r2(revenue - cost);

    const job = await tx.job.create({
      data: {
        number, mode: quo.mode, direction: quo.direction, status: "DRAFT",
        ...route,
        customerId: quo.customerId, salesPicId: quo.ownerId, createdById: userId,
        incoterm: quo.incoterm,
        shipperName: quo.direction === "EXPORT" ? quo.customer.name : null,
        consigneeName: quo.direction === "IMPORT" ? quo.customer.name : null,
        quotationId: quo.id,
        revenueIdr: new Prisma.Decimal(revenue), costIdr: new Prisma.Decimal(cost),
        profitIdr: new Prisma.Decimal(profit),
        marginPct: new Prisma.Decimal(revenue > 0 ? r2((profit / revenue) * 100) : 0),
        costings: { createMany: { data: costings } },
        milestones: {
          create: [{ code: "CREATED", title: "Job dibuat dari Quotation", isDone: true, actualAt: new Date(), sortOrder: 0, userId }],
        },
      },
    });

    return job.id;
  });

  await writeAudit({ entity: "Job", entityId: jobId, action: "CREATE_FROM_QUOTATION", summary: `Dari ${quo.number}`, userId });
  return jobId;
}
