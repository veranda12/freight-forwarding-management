"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma, type QuotationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertCan, requireUser, ForbiddenError } from "@/lib/auth-helpers";
import { canConvertQuotation } from "@/lib/rbac";
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
  const user = await assertCan("quotations", "write");
  if (!input.customerId) return { ok: false, error: "Customer wajib dipilih." };
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
        number, customerId: input.customerId, ownerId: input.ownerId || user.id,
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

export async function setQuotationStatus(id: string, status: QuotationStatus) {
  const user = await assertCan("quotations", "write");
  await prisma.quotation.update({
    where: { id },
    data: {
      status,
      ...(status === "SENT" ? { sentAt: new Date() } : {}),
      ...(["ACCEPTED", "REJECTED"].includes(status) ? { decidedAt: new Date() } : {}),
    },
  });
  await writeAudit({ entity: "Quotation", entityId: id, action: "STATUS", summary: status, userId: user.id });
  revalidatePath(`/quotations/${id}`);
  revalidatePath("/quotations");
}

/**
 * Convert quotation → job. Berhasil: redirect ke job. Gagal: mengembalikan pesan untuk ditampilkan (pesan error yang
 * dilempar server action disamarkan Next.js di production, jadi tidak dilempar).
 */
export async function convertQuotationToJob(quotationId: string): Promise<{ ok: false; error: string } | void> {
  let jobId: string;
  try {
    const user = await requireUser();
    if (!canConvertQuotation(user.role)) throw new ForbiddenError("quotations/jobs", "write");
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
        customerId: quo.customerId, salesPicId: quo.ownerId,
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
