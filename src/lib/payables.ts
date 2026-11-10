import { Prisma, type PrismaClient } from "@prisma/client";
import { accountMap, ACC } from "./coa";
import { jktKey, r2 } from "./accounting-core";
import { postJournal, reverseJournal, type JournalLineInput } from "./journal";
import { cashProofCode, genDocNumber, genProofNumber, SEQ } from "./sequence";
import { effectiveRate, IDR, latestRate } from "./fx";
import { resolveCashAccount, assertCashCurrency } from "./cash-accounts";
import { getLockKey } from "./period-lock";
import { formatDate, TZ } from "./format";

export type BillOpts = {
  currency?: string; rate?: number;
  /** PPN masukan dan potongan PPh, diisi manual sesuai tagihan vendor. */
  ppn?: number | null; pph23?: number | null; pph26?: number | null;
  date?: string; dueDate?: string; vendorRef?: string | null;
};

const money = (v: unknown, label: string) => {
  const n = v === undefined || v === null || v === "" ? 0 : Number(v);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${label} harus angka nol atau lebih.`);
  return r2(n);
};

/**
 * AP vendor bill untuk satu vendor dari baris buying yang dipilih, boleh dari beberapa job.
 * PPN dan PPh diisi manual. Net payable = subtotal + PPN masukan - PPh dipotong.
 * Baris yang sudah di-bill, masuk voucher, atau dicatat sebagai beban armada tidak bisa dipilih.
 */
export async function createBillCore(db: PrismaClient, vendorId: string, lineIds: string[], userId?: string, opts: BillOpts = {}): Promise<string> {
  const vendor = await db.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor) throw new Error("Vendor tidak ditemukan.");
  if (lineIds.length === 0) throw new Error("Pilih minimal satu biaya.");
  const lines = await db.costingLine.findMany({
    where: { id: { in: lineIds }, side: "BUYING" },
    include: { chargeCode: true, job: { select: { status: true } } },
    orderBy: [{ jobId: "asc" }, { sortOrder: "asc" }],
  });
  if (lines.length !== lineIds.length) throw new Error("Ada biaya yang tidak ditemukan. Muat ulang halaman.");
  if (lines.some((l) => l.vendorId !== vendorId)) throw new Error("Satu bill hanya untuk satu vendor.");
  if (lines.some((l) => l.billed || l.voucherId || l.recordedAt)) throw new Error("Ada biaya yang sudah di-bill atau masuk voucher. Muat ulang halaman.");
  if (lines.some((l) => l.job.status === "CANCELLED")) throw new Error("Ada job yang sudah dibatalkan.");
  const jobId = lines[0].jobId;

  const cur = (opts.currency || IDR).toUpperCase();
  let rate = 1;
  if (cur !== IDR) {
    rate = Number(opts.rate) > 0 ? Number(opts.rate) : (effectiveRate(lines, cur) ?? (await latestRate(db, cur)) ?? 0);
    if (!(rate > 0)) throw new Error(`Kurs ${cur} belum tersedia. Isi kurs bill secara manual.`);
  }

  const subtotal = r2(lines.reduce((s, l) => s + Number(l.actualIdr), 0));
  const jasa = r2(lines.filter((l) => !l.asReceipt).reduce((s, l) => s + Number(l.actualIdr), 0));
  const ppn = money(opts.ppn, "PPN");
  const pph23 = money(opts.pph23, "PPh 23");
  const pph26 = money(opts.pph26, "PPh 26");
  const total = r2(subtotal + ppn - pph23 - pph26);
  if (!(total > 0)) throw new Error("Nilai bill harus lebih dari 0.");
  const foreignTotal = cur === IDR ? 0 : r2(total / rate);
  // kurs tercatat = IDR tercatat / nominal valas (konsisten dengan pembulatan nominal valas)
  const effRate = foreignTotal > 0 ? Number((total / foreignTotal).toFixed(6)) : 1;

  return db.$transaction(async (tx) => {
    const acc = await accountMap(tx);
    const date = opts.date ? new Date(`${opts.date}T12:00:00+07:00`) : new Date();
    const dueDate = opts.dueDate ? new Date(`${opts.dueDate}T12:00:00+07:00`) : new Date(date);
    if (!opts.dueDate) dueDate.setDate(dueDate.getDate() + 30);

    // Beban per akun (sesuai charge code), reimburse ke akun titipan, lalu PPN masukan dan PPh.
    const expByAccount: Record<string, number> = {};
    for (const l of lines) {
      const accId = l.asReceipt ? acc[ACC.REIMBURSE] : l.chargeCode.expenseAccountId ?? acc[ACC.EXP_OTHER];
      expByAccount[accId] = r2((expByAccount[accId] ?? 0) + Number(l.actualIdr));
    }

    const number = await genDocNumber(tx, SEQ.BILL, date);
    const bill = await tx.vendorBill.create({
      data: {
        number, vendorId, jobId, date, dueDate, vendorRef: (opts.vendorRef ?? "").trim() || null,
        currency: cur, exchangeRate: new Prisma.Decimal(effRate.toFixed(6)),
        amountForeign: new Prisma.Decimal(foreignTotal), amountPaidForeign: new Prisma.Decimal(0),
        subtotal: new Prisma.Decimal(subtotal),
        pph23Base: new Prisma.Decimal(pph23 > 0 ? jasa : 0), pph23Amount: new Prisma.Decimal(pph23),
        pph26Base: new Prisma.Decimal(pph26 > 0 ? jasa : 0), pph26Amount: new Prisma.Decimal(pph26),
        ppnAmount: new Prisma.Decimal(ppn),
        total: new Prisma.Decimal(total), amountPaid: new Prisma.Decimal(0), status: "UNPAID", postedAt: date,
        lines: {
          create: lines.map((l) => ({
            chargeCodeId: l.chargeCodeId, description: l.chargeCode.name,
            qty: l.qty, unitPrice: new Prisma.Decimal(Number(l.actualIdr) / (Number(l.qty) || 1)),
            amount: new Prisma.Decimal(Number(l.actualIdr)), pph23: pph23 > 0 && !l.asReceipt, jobId: l.jobId,
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
    const marked = await tx.costingLine.updateMany({ where: { id: { in: lineIds }, billed: false, voucherId: null }, data: { billed: true } });
    if (marked.count !== lineIds.length) throw new Error("Biaya ini baru saja dipakai bill atau voucher lain. Muat ulang halaman.");
    return bill.id;
  });
}

/** Bill dari semua biaya vendor di satu job yang belum di-bill. */
export async function createBillFromJobCore(db: PrismaClient, jobId: string, vendorId: string, userId?: string, opts: BillOpts = {}): Promise<string> {
  const lines = await db.costingLine.findMany({
    where: { jobId, side: "BUYING", vendorId, billed: false, voucherId: null, recordedAt: null }, select: { id: true },
  });
  if (lines.length === 0) throw new Error("Tidak ada biaya beli untuk vendor ini yang belum di-bill.");
  return createBillCore(db, vendorId, lines.map((l) => l.id), userId, opts);
}

/** Hasil pencatatan pembayaran: dipakai voucher yang dibuat dalam transaksi yang sama. */
export type PaymentRecorded = { paymentId: string; number: string; journalEntryId: string };

export type VendorPaymentInput = {
  amount?: number; // IDR (bill IDR)
  amountForeign?: number; // nominal valas (bill valas)
  paymentRate?: number;
  date?: string;
  method?: string;
  reference?: string;
  bankAccountId?: string | null; // rekening pembayar; kosong = rekening default pembayaran
};

/**
 * Pembayaran ke vendor. Bill valas: selisih antara IDR yang tercatat (hutang) dan
 * IDR yang benar-benar dikeluarkan (nominal x kurs bayar) masuk ke 7100.
 */
export async function recordVendorPaymentTx(tx: Prisma.TransactionClient, billId: string, input: VendorPaymentInput, userId?: string): Promise<PaymentRecorded> {
  const bill = await tx.vendorBill.findUnique({ where: { id: billId }, include: { vendor: true } });
  if (!bill) throw new Error("Bill tidak ditemukan.");
  if (bill.status === "CANCELLED") throw new Error("Bill sudah dibatalkan.");
  if (bill.status === "PAID") throw new Error("Bill sudah lunas.");
  const date = input.date ? new Date(`${input.date}T12:00:00+07:00`) : new Date();

  const acc = await accountMap(tx);
  const cash = await resolveCashAccount(tx, input.bankAccountId, "payment");
  assertCashCurrency(cash, bill.currency, "pembayaran bill");
  const number = await genProofNumber(tx, cashProofCode(cash.kind, "OUT"), date);
  const outIdr = r2(Number(bill.total) - Number(bill.amountPaid));

  if (bill.currency === IDR) {
    const amount = r2(Number(input.amount));
    if (!(amount > 0)) throw new Error("Nominal harus lebih dari 0.");
    if (amount > outIdr + 0.5) throw new Error(`Melebihi sisa hutang (${outIdr}).`);
    const pay = await tx.payment.create({
      data: {
        number, direction: "PAYMENT", date, vendorId: bill.vendorId,
        method: (input.method as any) ?? "TRANSFER", reference: input.reference, currency: IDR, bankAccountId: cash.bankAccountId,
        amount: new Prisma.Decimal(amount),
        allocations: { create: [{ billId: bill.id, amount: new Prisma.Decimal(amount) }] },
      },
    });
    const jeId = await postJournal(tx, {
      date, description: `Pembayaran ${number} - ${bill.vendor.name}`, source: "PAYMENT", sourceId: pay.id,
      lines: [
        { accountId: acc[ACC.AP], debit: amount, description: `Pelunasan ${bill.number}` },
        { accountId: cash.coaId, credit: amount, description: `Pembayaran dari ${cash.name}` },
      ],
      createdById: userId, number,
    });
    await tx.payment.update({ where: { id: pay.id }, data: { journalEntryId: jeId } });
    const newPaid = r2(Number(bill.amountPaid) + amount);
    await tx.vendorBill.update({
      where: { id: bill.id },
      data: { amountPaid: new Prisma.Decimal(newPaid), status: newPaid >= Number(bill.total) - 0.5 ? "PAID" : "PARTIAL" },
    });
    return { paymentId: pay.id, number, journalEntryId: jeId };
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
      method: (input.method as any) ?? "TRANSFER", reference: input.reference, bankAccountId: cash.bankAccountId,
      currency: bill.currency, exchangeRate: new Prisma.Decimal(payRate.toFixed(6)),
      amount: new Prisma.Decimal(cashIdr),
      allocations: { create: [{ billId: bill.id, amount: new Prisma.Decimal(bookedIdr), amountForeign: new Prisma.Decimal(aF) }] },
    },
  });
  const lines: JournalLineInput[] = [
    { accountId: acc[ACC.AP], debit: bookedIdr, description: `Pelunasan ${bill.number}` },
    { accountId: cash.coaId, credit: cashIdr, description: `Pembayaran dari ${cash.name} ${bill.currency} ${aF}`, amountForeign: cash.currency === bill.currency ? aF : null },
  ];
  if (fx > 0) lines.push({ accountId: acc[ACC.FX], credit: fx, description: "Laba selisih kurs" });
  if (fx < 0) lines.push({ accountId: acc[ACC.FX], debit: -fx, description: "Rugi selisih kurs" });
  const jeId = await postJournal(tx, {
    date, description: `Pembayaran ${number} - ${bill.vendor.name}`, source: "PAYMENT", sourceId: pay.id, lines, createdById: userId, number,
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
  return { paymentId: pay.id, number, journalEntryId: jeId };
}

/** Pembayaran ke vendor dalam transaksinya sendiri. */
export async function recordVendorPaymentCore(db: PrismaClient, billId: string, input: VendorPaymentInput, userId?: string): Promise<void> {
  await db.$transaction((tx) => recordVendorPaymentTx(tx, billId, input, userId));
}

type Db = PrismaClient | Prisma.TransactionClient;
const monthLabel = (d: Date) => d.toLocaleDateString("id-ID", { month: "long", year: "numeric", timeZone: TZ });

/** Alasan pembayaran vendor bill tidak bisa dibatalkan, atau null bila bisa. Murni. */
export function vendorPaymentCancelBlock(p: {
  direction: string; hasBill: boolean; cancelledAt: Date | null; date: Date; lockKey: string | null;
  reconciled: boolean; reconciledAt: Date | null; fxRevalAfter: boolean; voucherNumber: string | null;
}): string | null {
  if (p.direction !== "PAYMENT" || !p.hasBill) return "Yang bisa dibatalkan di sini hanya pembayaran vendor bill.";
  if (p.cancelledAt) return "Pembayaran ini sudah dibatalkan.";
  if (p.voucherNumber) return `Pembayaran ini tercatat lewat voucher ${p.voucherNumber}. Koreksi lewat Jurnal Umum.`;
  if (p.reconciled) {
    const when = p.reconciledAt ? ` pada ${formatDate(p.reconciledAt)}` : "";
    return `Pembayaran ini sudah direkonsiliasi${when}. Buka dulu rekonsiliasinya di menu Rekonsiliasi Bank.`;
  }
  if (p.lockKey && jktKey(p.date) <= p.lockKey) return `Periode ${monthLabel(p.date)} sudah tutup buku. Buka dulu periodenya di menu Tutup Buku.`;
  if (p.fxRevalAfter) return "Bill valas ini sudah direvaluasi kurs setelah tanggal pembayaran, jadi pembayarannya tidak bisa dibatalkan.";
  return null;
}

/** Data pembayaran vendor untuk tombol Batalkan Pembayaran: alasan blokir dan bill yang ikut terdampak. */
export async function vendorPaymentCancelState(db: Db, paymentId: string) {
  const pay = await db.payment.findUnique({
    where: { id: paymentId },
    include: {
      voucher: { select: { number: true } },
      allocations: { include: { bill: { select: { id: true, number: true, currency: true, amountPaid: true, amountPaidForeign: true, status: true } } } },
    },
  });
  if (!pay) throw new Error("Pembayaran tidak ditemukan.");
  const journal = pay.journalEntryId
    ? await db.journalEntry.findUnique({ where: { id: pay.journalEntryId }, include: { lines: { select: { reconciledAt: true, statementLine: { select: { id: true } } } } } })
    : null;
  const recon = journal?.lines.filter((l) => l.reconciledAt || l.statementLine) ?? [];
  const fx = pay.allocations.some((a) => a.bill && a.bill.currency !== IDR)
    ? await db.journalEntry.count({ where: { source: "FX_REVAL", isReversed: false, isReversal: false, date: { gte: pay.date } } })
    : 0;
  const block = vendorPaymentCancelBlock({
    direction: pay.direction, hasBill: pay.allocations.some((a) => a.bill), cancelledAt: pay.cancelledAt, date: pay.date,
    lockKey: await getLockKey(db), reconciled: recon.length > 0, reconciledAt: recon.find((l) => l.reconciledAt)?.reconciledAt ?? null,
    fxRevalAfter: fx > 0, voucherNumber: pay.voucher?.number ?? null,
  });
  const bills = pay.allocations.flatMap((a) => (a.bill ? [a.bill.number] : []));
  return { pay, block, bills };
}

/**
 * Batalkan pembayaran vendor bill (khusus Admin). Jurnal pembayaran dibalik di tanggal yang sama,
 * pembayaran tetap tersimpan dengan tanda batal, dan bill kembali belum lunas sehingga bisa dibayar ulang
 * dengan nomor bukti baru. Isi bill dan biaya job tidak berubah.
 */
export async function cancelVendorPaymentCore(db: PrismaClient, paymentId: string, reason: string, userId?: string) {
  const why = reason.trim();
  if (why.length < 3) throw new Error("Alasan pembatalan wajib diisi.");
  return db.$transaction(async (tx) => {
    const { pay, block, bills } = await vendorPaymentCancelState(tx, paymentId);
    if (block) throw new Error(block);
    const marked = await tx.payment.updateMany({
      where: { id: pay.id, cancelledAt: null },
      data: { cancelledAt: new Date(), cancelReason: why, cancelledById: userId ?? null },
    });
    if (marked.count === 0) throw new Error("Pembayaran ini sudah dibatalkan.");
    if (pay.journalEntryId) await reverseJournal(tx, pay.journalEntryId, { date: pay.date, reason: `Pembayaran dibatalkan: ${why}`, createdById: userId });

    for (const a of pay.allocations) {
      const bill = a.bill;
      if (!bill) continue;
      const paid = Math.max(0, r2(Number(bill.amountPaid) - Number(a.amount)));
      const paidF = Math.max(0, r2(Number(bill.amountPaidForeign) - Number(a.amountForeign)));
      await tx.vendorBill.update({
        where: { id: bill.id },
        data: { amountPaid: new Prisma.Decimal(paid), amountPaidForeign: new Prisma.Decimal(paidF), status: paid > 0.5 ? "PARTIAL" : "UNPAID" },
      });
    }
    await tx.auditLog.create({
      data: {
        entity: "Payment", entityId: pay.id, action: "CANCEL", summary: `Pembayaran ${pay.number} dibatalkan: ${why}`, userId: userId ?? null,
        changes: { bills, amount: Number(pay.amount) },
      },
    });
    return { number: pay.number, bills };
  });
}
