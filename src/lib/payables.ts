import { Prisma, type PrismaClient } from "@prisma/client";
import { accountMap, ACC } from "./coa";
import { jktKey, PPH23_RATE, PPN_RATE, pph26Of, r2 } from "./accounting-core";
import { postJournal } from "./journal";
import { genDocNumber, SEQ } from "./sequence";
import { effectiveRate, IDR, latestRate } from "./fx";

/** Vendor pelayaran dan maskapai (carrier asing) tidak dikenakan PPN masukan di sini. */
const FOREIGN_CARRIER = ["SHIPPING_LINE", "AIRLINE"];

export type BillOpts = { currency?: string; rate?: number; ppnOverride?: number };

/**
 * AP vendor bill dari biaya beli job untuk satu vendor.
 * Net payable = subtotal + PPN masukan - PPh 23 dipotong.
 */
export async function createBillFromJobCore(db: PrismaClient, jobId: string, vendorId: string, userId?: string, opts: BillOpts = {}): Promise<string> {
  const vendor = await db.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor) throw new Error("Vendor tidak ditemukan.");
  const job = await db.job.findUnique({
    where: { id: jobId },
    include: { costings: { where: { side: "BUYING", vendorId, billed: false }, include: { chargeCode: true } } },
  });
  if (!job) throw new Error("Job tidak ditemukan.");
  const lines = job.costings;
  if (lines.length === 0) throw new Error("Tidak ada biaya beli untuk vendor ini yang belum di-bill.");

  const cur = (opts.currency || IDR).toUpperCase();
  let rate = 1;
  if (cur !== IDR) {
    rate = Number(opts.rate) > 0 ? Number(opts.rate) : (effectiveRate(lines, cur) ?? (await latestRate(db, cur)) ?? 0);
    if (!(rate > 0)) throw new Error(`Kurs ${cur} belum tersedia. Isi kurs bill secara manual.`);
  }

  const subtotal = r2(lines.reduce((s, l) => s + Number(l.actualIdr), 0));
  const local = !FOREIGN_CARRIER.includes(vendor.type);
  const ppnCalc = local ? r2(lines.filter((l) => l.taxable).reduce((s, l) => s + Number(l.actualIdr), 0) * PPN_RATE) : 0;
  const ppn = opts.ppnOverride !== undefined && opts.ppnOverride !== null ? r2(Number(opts.ppnOverride)) : ppnCalc;
  // PPh 23 untuk vendor dalam negeri; PPh 26 untuk vendor luar negeri (baris dengan flag charge code).
  const pph23Base = vendor.isForeign ? 0 : r2(lines.filter((l) => l.chargeCode.isPph23).reduce((s, l) => s + Number(l.actualIdr), 0));
  const pph23 = r2(pph23Base * PPH23_RATE);
  const pph26Lines = vendor.isForeign ? lines.filter((l) => l.chargeCode.isPph26) : [];
  const pph26Base = r2(pph26Lines.reduce((s, l) => s + Number(l.actualIdr), 0));
  const pph26 = r2(pph26Lines.reduce((s, l) => s + pph26Of(Number(l.actualIdr), Number(vendor.pph26Rate ?? l.chargeCode.pph26Rate)), 0));
  const total = r2(subtotal + ppn - pph23 - pph26);
  const foreignTotal = cur === IDR ? 0 : r2(total / rate);
  // kurs tercatat = IDR tercatat / nominal valas (konsisten dengan pembulatan nominal valas)
  const effRate = foreignTotal > 0 ? Number((total / foreignTotal).toFixed(6)) : 1;

  return db.$transaction(async (tx) => {
    const acc = await accountMap(tx);
    const date = new Date();
    const dueDate = new Date(date);
    dueDate.setDate(dueDate.getDate() + 30);

    // Beban per akun (sesuai charge code), lalu PPN masukan dan PPh 23.
    const expByAccount: Record<string, number> = {};
    for (const l of lines) {
      const accId = l.chargeCode.expenseAccountId ?? acc[ACC.EXP_OTHER];
      expByAccount[accId] = r2((expByAccount[accId] ?? 0) + Number(l.actualIdr));
    }

    const number = await genDocNumber(tx, SEQ.BILL, date);
    const bill = await tx.vendorBill.create({
      data: {
        number, vendorId, jobId: job.id, date, dueDate,
        currency: cur, exchangeRate: new Prisma.Decimal(effRate.toFixed(6)),
        amountForeign: new Prisma.Decimal(foreignTotal), amountPaidForeign: new Prisma.Decimal(0),
        subtotal: new Prisma.Decimal(subtotal),
        pph23Base: new Prisma.Decimal(pph23Base), pph23Amount: new Prisma.Decimal(pph23),
        pph26Base: new Prisma.Decimal(pph26Base), pph26Amount: new Prisma.Decimal(pph26),
        ppnAmount: new Prisma.Decimal(ppn),
        total: new Prisma.Decimal(total), amountPaid: new Prisma.Decimal(0), status: "UNPAID", postedAt: date,
        lines: {
          create: lines.map((l) => ({
            chargeCodeId: l.chargeCodeId, description: l.chargeCode.name,
            qty: l.qty, unitPrice: new Prisma.Decimal(Number(l.actualIdr) / (Number(l.qty) || 1)),
            amount: new Prisma.Decimal(Number(l.actualIdr)), pph23: l.chargeCode.isPph23,
          })),
        },
      },
    });

    const jLines: { accountId: string; debit?: number; credit?: number; description?: string }[] = [];
    for (const [accId, amt] of Object.entries(expByAccount)) jLines.push({ accountId: accId, debit: amt, description: `Bill ${number}` });
    if (ppn > 0) jLines.push({ accountId: acc[ACC.PPN_IN], debit: ppn, description: "PPN Masukan" });
    jLines.push({ accountId: acc[ACC.AP], credit: total, description: `Bill ${number} - ${vendor.name}` });
    if (pph23 > 0) jLines.push({ accountId: acc[ACC.PPH23], credit: pph23, description: "PPh 23 dipotong" });
    if (pph26 > 0) jLines.push({ accountId: acc[ACC.PPH26], credit: pph26, description: "PPh 26 dipotong" });
    const jeId = await postJournal(tx, { date, description: `Vendor Bill ${number} - ${vendor.name}`, source: "BILL", sourceId: bill.id, lines: jLines, createdById: userId });
    await tx.vendorBill.update({ where: { id: bill.id }, data: { journalEntryId: jeId } });
    await tx.costingLine.updateMany({ where: { id: { in: lines.map((l) => l.id) } }, data: { billed: true } });
    return bill.id;
  });
}

export type VendorPaymentInput = {
  amount?: number; // IDR (bill IDR)
  amountForeign?: number; // nominal valas (bill valas)
  paymentRate?: number;
  date?: string;
  method?: string;
  reference?: string;
};

/**
 * Pembayaran ke vendor. Bill valas: selisih antara IDR yang tercatat (hutang) dan
 * IDR yang benar-benar dikeluarkan (nominal x kurs bayar) masuk ke 7100.
 */
export async function recordVendorPaymentCore(db: PrismaClient, billId: string, input: VendorPaymentInput, userId?: string): Promise<void> {
  const bill = await db.vendorBill.findUnique({ where: { id: billId }, include: { vendor: true } });
  if (!bill) throw new Error("Bill tidak ditemukan.");
  if (bill.status === "CANCELLED") throw new Error("Bill sudah dibatalkan.");
  if (bill.status === "PAID") throw new Error("Bill sudah lunas.");
  const date = input.date ? new Date(`${input.date}T12:00:00+07:00`) : new Date();

  await db.$transaction(async (tx) => {
    const acc = await accountMap(tx);
    const number = await genDocNumber(tx, SEQ.PAYMENT, date);
    const outIdr = r2(Number(bill.total) - Number(bill.amountPaid));

    if (bill.currency === IDR) {
      const amount = r2(Number(input.amount));
      if (!(amount > 0)) throw new Error("Nominal harus lebih dari 0.");
      if (amount > outIdr + 0.5) throw new Error(`Melebihi sisa hutang (${outIdr}).`);
      const pay = await tx.payment.create({
        data: {
          number, direction: "PAYMENT", date, vendorId: bill.vendorId,
          method: (input.method as any) ?? "TRANSFER", reference: input.reference, currency: IDR,
          amount: new Prisma.Decimal(amount),
          allocations: { create: [{ billId: bill.id, amount: new Prisma.Decimal(amount) }] },
        },
      });
      const jeId = await postJournal(tx, {
        date, description: `Pembayaran ${number} - ${bill.vendor.name}`, source: "PAYMENT", sourceId: pay.id,
        lines: [
          { accountId: acc[ACC.AP], debit: amount, description: `Pelunasan ${bill.number}` },
          { accountId: acc[ACC.BANK], credit: amount, description: "Pembayaran bank" },
        ],
        createdById: userId,
      });
      await tx.payment.update({ where: { id: pay.id }, data: { journalEntryId: jeId } });
      const newPaid = r2(Number(bill.amountPaid) + amount);
      await tx.vendorBill.update({
        where: { id: bill.id },
        data: { amountPaid: new Prisma.Decimal(newPaid), status: newPaid >= Number(bill.total) - 0.5 ? "PAID" : "PARTIAL" },
      });
      return;
    }

    const aF = r2(Number(input.amountForeign));
    if (!(aF > 0)) throw new Error(`Nominal ${bill.currency} harus lebih dari 0.`);
    const outF = r2(Number(bill.amountForeign) - Number(bill.amountPaidForeign));
    if (aF > outF + 0.01) throw new Error(`Melebihi sisa hutang ${bill.currency} (${outF}).`);
    const isFull = aF >= outF - 0.005;
    const bookedIdr = isFull ? outIdr : r2(aF * Number(bill.exchangeRate));
    const payRate = Number(input.paymentRate) > 0 ? Number(input.paymentRate) : await latestRate(tx, bill.currency, jktKey(date));
    if (!(payRate && payRate > 0)) throw new Error(`Kurs ${bill.currency} untuk tanggal ini belum ada. Isi kurs pembayaran.`);
    const cashIdr = r2(aF * payRate);
    const fx = r2(bookedIdr - cashIdr); // > 0: bayar lebih murah dari tercatat (laba kurs)

    const pay = await tx.payment.create({
      data: {
        number, direction: "PAYMENT", date, vendorId: bill.vendorId,
        method: (input.method as any) ?? "TRANSFER", reference: input.reference,
        currency: bill.currency, exchangeRate: new Prisma.Decimal(payRate.toFixed(6)),
        amount: new Prisma.Decimal(cashIdr),
        allocations: { create: [{ billId: bill.id, amount: new Prisma.Decimal(bookedIdr), amountForeign: new Prisma.Decimal(aF) }] },
      },
    });
    const lines: { accountId: string; debit?: number; credit?: number; description?: string }[] = [
      { accountId: acc[ACC.AP], debit: bookedIdr, description: `Pelunasan ${bill.number}` },
      { accountId: acc[ACC.BANK], credit: cashIdr, description: `Pembayaran ${bill.currency} ${aF}` },
    ];
    if (fx > 0) lines.push({ accountId: acc[ACC.FX], credit: fx, description: "Laba selisih kurs" });
    if (fx < 0) lines.push({ accountId: acc[ACC.FX], debit: -fx, description: "Rugi selisih kurs" });
    const jeId = await postJournal(tx, {
      date, description: `Pembayaran ${number} - ${bill.vendor.name}`, source: "PAYMENT", sourceId: pay.id, lines, createdById: userId,
    });
    await tx.payment.update({ where: { id: pay.id }, data: { journalEntryId: jeId } });
    const newPaidIdr = r2(Number(bill.amountPaid) + bookedIdr);
    const newPaidF = r2(Number(bill.amountPaidForeign) + aF);
    await tx.vendorBill.update({
      where: { id: bill.id },
      data: {
        amountPaid: new Prisma.Decimal(newPaidIdr),
        amountPaidForeign: new Prisma.Decimal(newPaidF),
        status: isFull || newPaidIdr >= Number(bill.total) - 0.5 ? "PAID" : "PARTIAL",
      },
    });
  });
}
