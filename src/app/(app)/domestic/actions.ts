"use server";

import { revalidatePath } from "next/cache";
import { Prisma, type DomesticStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertPerm, assertNotOwn } from "@/lib/auth-helpers";
import { customerScope, domesticScope } from "@/lib/data-scope";
import { writeAudit } from "@/lib/audit";
import { genDocNumber, SEQ } from "@/lib/sequence";
import { postJournal } from "@/lib/journal";
import { accountMap, ACC } from "@/lib/coa";
import { clean } from "@/lib/crud";
import { quoteDomestic } from "@/lib/chargeable";
import { getWeightRules } from "@/lib/weight-rules";
import { DOM_STATUS_FLOW, DOM_STATUS_LABELS } from "@/lib/enums";
import { domesticShipmentSchema, domesticTariffSchema } from "@/lib/validators";
import type { EntityActionResult } from "@/components/crud/entity-form";

const r2 = (n: number) => Math.round(n * 100) / 100;
const D = (n: number) => new Prisma.Decimal(n);
const PPN = 0.11;

export type ActionResult = { ok: boolean; error?: string; id?: string };

/* ------------------------------------------------------------------ */
/*  STT (Surat Tanda Terima)                                           */
/* ------------------------------------------------------------------ */

export async function createDomesticShipment(input: unknown): Promise<ActionResult> {
  const user = await assertPerm("domestic.create");
  const parsed = domesticShipmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const d = parsed.data;
  const cust = await prisma.customer.findFirst({ where: { id: d.customerId, ...customerScope(user) }, select: { id: true } });
  if (!cust) return { ok: false, error: "Customer tidak ditemukan." };

  const tariff = await prisma.domesticTariff.findFirst({
    where: { mode: d.mode, originCity: d.originCity, destCity: d.destCity, isActive: true },
  });
  const customRate = d.customRatePerKg > 0 ? d.customRatePerKg : 0;
  if (!tariff && !customRate) {
    return { ok: false, error: `Belum ada tarif ${d.mode.toLowerCase()} ${d.originCity} → ${d.destCity}. Tambahkan di Tarif Domestik atau isi harga khusus per kg.` };
  }

  // harga dihitung ulang di server — angka dari browser tidak dipercaya
  const rules = await getWeightRules("DOMESTIC");
  const rule = rules[d.mode];
  const ratePerKg = customRate || Number(tariff!.ratePerKg);
  const q = quoteDomestic({
    packages: d.packages, rule, ratePerKg,
    tariffMinKg: tariff ? Number(tariff.minChargeKg) : 0,
    declaredValue: d.declaredValue, insurancePct: d.insurancePct,
    packing: d.packingAmount, other: d.otherAmount,
  });
  if (q.chargeableKg <= 0) return { ok: false, error: "Berat/dimensi koli belum diisi." };

  const pickupDate = d.pickupDate ? new Date(d.pickupDate) : new Date();
  const leadMax = tariff?.leadTimeMax ?? null;
  const etaDate = leadMax != null ? new Date(pickupDate.getTime() + leadMax * 86400000) : null;

  const id = await prisma.$transaction(async (tx) => {
    const number = await genDocNumber(tx, SEQ.STT);
    const s = await tx.domesticShipment.create({
      data: {
        number, status: "BOOKED", mode: d.mode, customerId: d.customerId,
        originCity: d.originCity, destCity: d.destCity,
        shipperName: d.shipperName, shipperPhone: clean(d.shipperPhone), shipperAddress: clean(d.shipperAddress),
        consigneeName: d.consigneeName, consigneePhone: clean(d.consigneePhone), consigneeAddress: clean(d.consigneeAddress),
        goodsDescription: clean(d.goodsDescription), declaredValue: D(d.declaredValue),
        totalKoli: q.totalKoli, actualWeightKg: D(q.actualKg), volumeCbm: D(q.volumeCbm),
        volumetricWeightKg: D(q.volumetricKg), chargeableWeightKg: D(q.chargeableKg), divisor: rule.divisor,
        tariffId: tariff?.id ?? null, ratePerKg: D(ratePerKg),
        leadTimeMin: tariff?.leadTimeMin ?? null, leadTimeMax: leadMax,
        freightAmount: D(q.freight), packingAmount: D(q.packing), insurancePct: D(d.insurancePct),
        insuranceAmount: D(q.insurance), otherAmount: D(q.other), totalAmount: D(q.total),
        vendorId: clean(d.vendorId), costAmount: D(d.costAmount),
        pickupDate, etaDate, notes: clean(d.notes), createdById: user.id,
        packages: {
          create: d.packages.map((p, i) => ({
            qty: p.qty, lengthCm: D(p.lengthCm), widthCm: D(p.widthCm), heightCm: D(p.heightCm),
            weightKg: D(p.weightKg), description: clean(p.description), sortOrder: i,
          })),
        },
        events: { create: [{ status: "BOOKED", location: d.originCity, note: customRate ? `Harga khusus Rp ${customRate.toLocaleString("id-ID")}/kg` : null, userId: user.id }] },
      },
    });
    return s.id;
  });

  await writeAudit({ entity: "DomesticShipment", entityId: id, action: "CREATE", userId: user.id });
  revalidatePath("/domestic");
  return { ok: true, id };
}

export async function updateDomesticStatus(
  id: string,
  status: DomesticStatus,
  extra: { location?: string; note?: string; receivedBy?: string } = {},
): Promise<ActionResult> {
  const user = await assertPerm("domestic.status");
  const s = await prisma.domesticShipment.findFirst({ where: { id, ...domesticScope(user) } });
  if (!s) return { ok: false, error: "STT tidak ditemukan." };
  if (s.status === "CANCELLED" || s.status === "DELIVERED") return { ok: false, error: "STT sudah selesai/dibatalkan." };
  if (status === "CANCELLED") return { ok: false, error: "Gunakan tombol Batalkan STT." };
  if (DOM_STATUS_FLOW.indexOf(status) <= DOM_STATUS_FLOW.indexOf(s.status)) {
    return { ok: false, error: "Status hanya bisa maju." };
  }
  const receivedBy = clean(extra.receivedBy);
  if (status === "DELIVERED" && !receivedBy) return { ok: false, error: "Isi nama penerima (bukti terima)." };

  const now = new Date();
  await prisma.domesticShipment.update({
    where: { id },
    data: {
      status,
      ...(status === "PICKED_UP" && !s.pickupDate ? { pickupDate: now } : {}),
      ...(status === "DELIVERED" ? { deliveredAt: now, receivedBy, podNote: clean(extra.note) } : {}),
      events: { create: [{ status, location: clean(extra.location), note: clean(extra.note), userId: user.id }] },
    },
  });
  await writeAudit({ entity: "DomesticShipment", entityId: id, action: "STATUS_CHANGE", summary: `Status → ${DOM_STATUS_LABELS[status]}`, userId: user.id });
  revalidatePath(`/domestic/${id}`);
  revalidatePath("/domestic");
  return { ok: true };
}

export async function cancelDomesticShipment(id: string, reason?: string): Promise<ActionResult> {
  const user = await assertPerm("domestic.cancel");
  const s = await prisma.domesticShipment.findFirst({ where: { id, ...domesticScope(user) }, include: { invoices: { where: { status: { not: "CANCELLED" } } } } });
  if (!s) return { ok: false, error: "STT tidak ditemukan." };
  try { assertNotOwn(user, "domestic.cancelOwn", [s.createdById], "membatalkan"); } catch (e) { return { ok: false, error: (e as Error).message }; }
  if (s.status === "DELIVERED" || s.status === "CANCELLED") return { ok: false, error: "STT sudah selesai/dibatalkan." };
  if (s.invoices.length) return { ok: false, error: "Batalkan invoice STT ini dulu." };
  await prisma.domesticShipment.update({
    where: { id },
    data: { status: "CANCELLED", events: { create: [{ status: "CANCELLED", note: clean(reason), userId: user.id }] } },
  });
  await writeAudit({ entity: "DomesticShipment", entityId: id, action: "CANCEL", summary: clean(reason) ?? undefined, userId: user.id });
  revalidatePath(`/domestic/${id}`);
  revalidatePath("/domestic");
  return { ok: true };
}

/** Invoice AR dari STT (freight, packing, asuransi, lain-lain) + jurnal otomatis. */
export async function createInvoiceFromDomestic(id: string): Promise<ActionResult> {
  const user = await assertPerm("domestic.invoice");
  const s = await prisma.domesticShipment.findFirst({
    where: { id, ...domesticScope(user) },
    include: { customer: true, invoices: { where: { status: { not: "CANCELLED" } } } },
  });
  if (!s) return { ok: false, error: "STT tidak ditemukan." };
  if (s.status === "CANCELLED") return { ok: false, error: "STT dibatalkan." };
  if (s.invoices.length) return { ok: false, error: `STT sudah ditagih (${s.invoices[0].number}).` };

  const codes = await prisma.chargeCode.findMany({ where: { code: { in: ["DOMFRT", "PACK", "INS", "HANDLING"] } } });
  const code = (c: string) => codes.find((x) => x.code === c);
  if (!code("DOMFRT")) return { ok: false, error: "Charge code DOMFRT belum ada. Jalankan seed domestik (npx tsx prisma/seed-domestic.ts)." };

  const parts: { code: string; label: string; amount: number }[] = [
    { code: "DOMFRT", label: `Freight ${s.originCity} → ${s.destCity} (${Number(s.chargeableWeightKg)} kg × Rp ${Number(s.ratePerKg).toLocaleString("id-ID")})`, amount: Number(s.freightAmount) },
    { code: "PACK", label: "Packing kayu", amount: Number(s.packingAmount) },
    { code: "INS", label: `Asuransi ${Number(s.insurancePct)}% × nilai barang`, amount: Number(s.insuranceAmount) },
    { code: "HANDLING", label: "Biaya lain-lain", amount: Number(s.otherAmount) },
  ].filter((p) => p.amount > 0 && code(p.code));

  const invoiceId = await prisma.$transaction(async (tx) => {
    const acc = await accountMap(tx);
    const date = new Date();
    const dueDate = new Date(date.getTime() + (s.customer.termOfPayment ?? 30) * 86400000);
    let subtotal = 0, taxableBase = 0;
    const revByAccount: Record<string, number> = {};
    const lines: Prisma.InvoiceLineCreateWithoutInvoiceInput[] = [];
    for (const p of parts) {
      const cc = code(p.code)!;
      subtotal += p.amount;
      if (cc.defaultTaxable) taxableBase += p.amount;
      const accId = cc.revenueAccountId ?? acc[ACC.REV_OTHER];
      revByAccount[accId] = r2((revByAccount[accId] ?? 0) + p.amount);
      lines.push({ chargeCode: { connect: { id: cc.id } }, description: p.label, qty: D(1), unitPrice: D(p.amount), amount: D(p.amount), taxable: cc.defaultTaxable });
    }
    subtotal = r2(subtotal); taxableBase = r2(taxableBase);
    const ppn = r2(taxableBase * PPN);
    const total = r2(subtotal + ppn);

    const number = await genDocNumber(tx, SEQ.INVOICE, date);
    const inv = await tx.invoice.create({
      data: {
        number, domesticShipmentId: s.id, customerId: s.customerId, date, dueDate, currency: "IDR", createdById: user.id,
        subtotal: D(subtotal), taxableBase: D(taxableBase), ppnAmount: D(ppn), total: D(total),
        status: "UNPAID", postedAt: date, notes: `STT ${s.number}`, lines: { create: lines },
      },
    });
    const jLines = [{ accountId: acc[ACC.AR], debit: total, description: `Invoice ${number}` }] as { accountId: string; debit?: number; credit?: number; description?: string }[];
    for (const [accId, amt] of Object.entries(revByAccount)) jLines.push({ accountId: accId, credit: amt });
    if (ppn > 0) jLines.push({ accountId: acc[ACC.PPN_OUT], credit: ppn, description: "PPN Keluaran" });
    const jeId = await postJournal(tx, { date, description: `AR Invoice ${number} — ${s.customer.name} (STT ${s.number})`, source: "INVOICE", sourceId: inv.id, lines: jLines, createdById: user.id });
    await tx.invoice.update({ where: { id: inv.id }, data: { journalEntryId: jeId } });
    return inv.id;
  });

  await writeAudit({ entity: "Invoice", entityId: invoiceId, action: "CREATE_FROM_STT", summary: s.number, userId: user.id });
  revalidatePath(`/domestic/${id}`);
  revalidatePath("/invoices");
  return { ok: true, id: invoiceId };
}

/* ------------------------------------------------------------------ */
/*  Tarif domestik                                                     */
/* ------------------------------------------------------------------ */

const titleCase = (v: string) => v.trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

export async function saveDomesticTariff(values: Record<string, unknown>): Promise<EntityActionResult> {
  const user = await assertPerm("domesticTariffs.edit");
  const parsed = domesticTariffSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const d = parsed.data;
  const id = clean(values.id);
  const data = {
    mode: d.mode, originCity: titleCase(d.originCity), destCity: titleCase(d.destCity),
    ratePerKg: D(d.ratePerKg), minChargeKg: D(d.minChargeKg),
    leadTimeMin: d.leadTimeMin, leadTimeMax: d.leadTimeMax, note: clean(d.note),
    isActive: values.isActive === undefined ? true : Boolean(values.isActive),
  };
  try {
    if (id) {
      await prisma.domesticTariff.update({ where: { id }, data });
      await writeAudit({ entity: "DomesticTariff", entityId: id, action: "UPDATE", summary: `${data.originCity} → ${data.destCity}`, userId: user.id });
    } else {
      const t = await prisma.domesticTariff.create({ data });
      await writeAudit({ entity: "DomesticTariff", entityId: t.id, action: "CREATE", summary: `${data.originCity} → ${data.destCity}`, userId: user.id });
    }
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: `Tarif ${d.mode.toLowerCase()} ${data.originCity} → ${data.destCity} sudah ada. Edit tarif yang ada.` };
    }
    throw e;
  }
  revalidatePath("/domestic/tariffs");
  revalidatePath("/domestic/check");
  return { ok: true, redirect: "/domestic/tariffs" };
}
