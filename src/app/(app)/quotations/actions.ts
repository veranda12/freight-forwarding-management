"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma, type QuotationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/auth-helpers";
import { writeAudit } from "@/lib/audit";
import { genJobNumber } from "@/lib/sequence";
import { modeDirKey } from "@/lib/enums";

const r2 = (n: number) => Math.round(n * 100) / 100;

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

export async function convertQuotationToJob(quotationId: string): Promise<void> {
  const user = await assertCan("jobs", "write");

  const quo = await prisma.quotation.findUnique({
    where: { id: quotationId },
    include: { lines: { include: { chargeCode: true } }, customer: true, job: true },
  });
  if (!quo) throw new Error("Quotation tidak ditemukan.");
  if (quo.job) redirect(`/jobs/${quo.job.id}`);

  const jobId = await prisma.$transaction(async (tx) => {
    const modeDir = modeDirKey(quo.mode, quo.direction);
    const number = await genJobNumber(tx, modeDir);

    let revenue = 0, cost = 0;
    const costings: Prisma.CostingLineCreateManyJobInput[] = [];
    let order = 0;
    for (const ln of quo.lines) {
      const fx = Number(ln.exchangeRate);
      const qty = Number(ln.qty);
      const sell = Number(ln.sellingPrice);
      const buy = Number(ln.buyingPrice);
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
          create: [{ code: "CREATED", title: "Job dibuat dari Quotation", isDone: true, actualAt: new Date(), sortOrder: 0, userId: user.id }],
        },
      },
    });

    await tx.quotation.update({ where: { id: quo.id }, data: { status: "ACCEPTED", decidedAt: new Date() } });
    return job.id;
  });

  await writeAudit({ entity: "Job", entityId: jobId, action: "CREATE_FROM_QUOTATION", summary: `Dari ${quo.number}`, userId: user.id });
  revalidatePath("/jobs");
  revalidatePath("/quotations");
  redirect(`/jobs/${jobId}`);
}
