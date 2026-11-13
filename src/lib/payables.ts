import { Prisma, type PrismaClient } from "@prisma/client";
import { accountMap, ACC } from "./coa";
import { jktKey, r2 } from "./accounting-core";
import { postJournal, replaceJournal, reverseJournal, type JournalLineInput } from "./journal";
import { cashProofCode, genDocNumber, genProofNumber, SEQ } from "./sequence";
import { effectiveRate, IDR, latestRate } from "./fx";
import { resolveCashAccount, assertCashCurrency } from "./cash-accounts";
import { getClosedMonths, isClosedKey, closedMessage } from "./period-lock";
import { formatDate, formatIDR } from "./format";

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

type BuyingLine = Prisma.CostingLineGetPayload<{ include: { chargeCode: true } }>;
type JLine = { accountId: string; debit?: number; credit?: number; description?: string };

/** Nilai bill dari baris buying dan isian kurs, PPN, dan PPh. Dipakai saat buat dan edit supaya rumusnya sama. */
async function billAmounts(db: Db, lines: BuyingLine[], opts: BillOpts) {
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
  return { cur, subtotal, jasa, ppn, pph23, pph26, total, foreignTotal, effRate };
}

/** Kolom nilai bill, baris bill, dan baris jurnal (beban per akun, reimburse, PPN masukan, hutang, PPh). */
function billPosting(lines: BuyingLine[], a: Awaited<ReturnType<typeof billAmounts>>, acc: Record<string, string>, number: string, vendorName: string) {
  const expByAccount: Record<string, number> = {};
  for (const l of lines) {
    const accId = l.asReceipt ? acc[ACC.REIMBURSE] : l.chargeCode.expenseAccountId ?? acc[ACC.EXP_OTHER];
    expByAccount[accId] = r2((expByAccount[accId] ?? 0) + Number(l.actualIdr));
  }
  const fields = {
    currency: a.cur, exchangeRate: new Prisma.Decimal(a.effRate.toFixed(6)), amountForeign: new Prisma.Decimal(a.foreignTotal),
    subtotal: new Prisma.Decimal(a.subtotal),
    pph23Base: new Prisma.Decimal(a.pph23 > 0 ? a.jasa : 0), pph23Amount: new Prisma.Decimal(a.pph23),
    pph26Base: new Prisma.Decimal(a.pph26 > 0 ? a.jasa : 0), pph26Amount: new Prisma.Decimal(a.pph26),
    ppnAmount: new Prisma.Decimal(a.ppn), total: new Prisma.Decimal(a.total),
  };
  const lineData = lines.map((l) => ({
    chargeCodeId: l.chargeCodeId, description: l.chargeCode.name,
    qty: l.qty, unitPrice: new Prisma.Decimal(Number(l.actualIdr) / (Number(l.qty) || 1)),
    amount: new Prisma.Decimal(Number(l.actualIdr)), pph23: a.pph23 > 0 && !l.asReceipt, jobId: l.jobId,
  }));
  const jLines: JLine[] = [];
  for (const [accId, amt] of Object.entries(expByAccount)) jLines.push({ accountId: accId, debit: amt, description: `Bill ${number}` });
  if (a.ppn > 0) jLines.push({ accountId: acc[ACC.PPN_IN], debit: a.ppn, description: "PPN Masukan" });
  jLines.push({ accountId: acc[ACC.AP], credit: a.total, description: `Bill ${number} - ${vendorName}` });
  if (a.pph23 > 0) jLines.push({ accountId: acc[ACC.PPH23], credit: a.pph23, description: "PPh 23 dipotong" });
  if (a.pph26 > 0) jLines.push({ accountId: acc[ACC.PPH26], credit: a.pph26, description: "PPh 26 dipotong" });
  return { fields, lineData, jLines };
}

const billDate = (key: string) => new Date(`${key}T12:00:00+07:00`);

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
  const a = await billAmounts(db, lines, opts);

  return db.$transaction(async (tx) => {
    const acc = await accountMap(tx);
    const date = opts.date ? billDate(opts.date) : new Date();
    const dueDate = opts.dueDate ? billDate(opts.dueDate) : new Date(date);
    if (!opts.dueDate) dueDate.setDate(dueDate.getDate() + 30);

    const number = await genDocNumber(tx, SEQ.BILL, date);
    const { fields, lineData, jLines } = billPosting(lines, a, acc, number, vendor.name);
    const bill = await tx.vendorBill.create({
      data: {
        number, vendorId, jobId, date, dueDate, vendorRef: (opts.vendorRef ?? "").trim() || null,
        ...fields, amountPaidForeign: new Prisma.Decimal(0), amountPaid: new Prisma.Decimal(0), status: "UNPAID", postedAt: date,
        lines: { create: lineData },
      },
    });

    const jeId = await postJournal(tx, { date, description: `Vendor Bill ${number} - ${vendor.name}`, source: "BILL", sourceId: bill.id, lines: jLines, createdById: userId });
    await tx.vendorBill.update({ where: { id: bill.id }, data: { journalEntryId: jeId } });
    const marked = await tx.costingLine.updateMany({ where: { id: { in: lineIds }, billed: false, voucherId: null }, data: { billed: true, billId: bill.id } });
    if (marked.count !== lineIds.length) throw new Error("Biaya ini baru saja dipakai bill atau voucher lain. Muat ulang halaman.");
    return bill.id;
  });
}

// ---------------------------------------------------------------- edit dan batal vendor bill

/**
 * Alasan bill tidak bisa diedit atau dibatalkan, atau null bila bisa. Murni.
 * Urutannya: yang paling perlu ditindaklanjuti user lebih dulu (pembayaran, voucher), lalu kurs dan periode.
 */
export function billChangeBlock(b: {
  status: string; amountPaid: number; currency: string; date: Date; vouchers: string[]; revalued: boolean; closedMonths: string[];
}, action: "edit" | "cancel" | "any"): string | null {
  const verb = action === "edit" ? "diedit" : action === "cancel" ? "dibatalkan" : "diedit atau dibatalkan";
  if (b.status === "CANCELLED") return "Bill ini sudah dibatalkan.";
  if (b.amountPaid > 0.005 || b.status === "PAID" || b.status === "PARTIAL") {
    const paid = b.amountPaid > 0.005 ? ` ${formatIDR(b.amountPaid)}` : "";
    return `Bill ini sudah dibayar${paid} ke vendor. Batalkan pembayarannya dulu (khusus Admin), baru bill bisa ${verb}.`;
  }
  if (b.vouchers.length) return `Bill ini sudah dibuatkan voucher ${b.vouchers.join(", ")}. Batalkan vouchernya dulu, baru bill bisa ${verb}.`;
  if (b.revalued) return `Bill ${b.currency} ini sudah direvaluasi kurs, jadi nilai hutangnya tidak bisa ${verb} lagi.`;
  if (isClosedKey(b.closedMonths, jktKey(b.date))) return closedMessage(jktKey(b.date));
  return null;
}

/** Data bill untuk tombol Edit dan Batalkan: alasan blokir masing-masing. */
export async function billChangeState(db: Db, billId: string) {
  const bill = await db.vendorBill.findUnique({
    where: { id: billId },
    include: { vendor: { select: { name: true } }, lines: { select: { id: true, jobId: true, chargeCodeId: true, amount: true } } },
  });
  if (!bill) throw new Error("Bill tidak ditemukan.");
  const vouchers = await db.voucher.findMany({ where: { billId, status: { not: "CANCELLED" } }, select: { number: true } });
  // Bill valas yang sudah direvaluasi: hutang di jurnal asal tidak sama lagi dengan total sekarang.
  const apLine = bill.journalEntryId
    ? await db.journalLine.findFirst({ where: { entryId: bill.journalEntryId, account: { code: ACC.AP } }, select: { credit: true } })
    : null;
  const input = {
    status: bill.status, amountPaid: Number(bill.amountPaid), currency: bill.currency, date: bill.date,
    vouchers: vouchers.map((v) => v.number), revalued: !!apLine && Math.abs(Number(apLine.credit) - Number(bill.total)) > 0.5,
    closedMonths: await getClosedMonths(db),
  };
  // anyBlock: satu kalimat untuk ditampilkan bila edit dan batal sama-sama diblokir karena alasan yang sama.
  return { bill, editBlock: billChangeBlock(input, "edit"), cancelBlock: billChangeBlock(input, "cancel"), anyBlock: billChangeBlock(input, "any") };
}

type BillForLink = { id: string; vendorId: string; lines: { jobId: string | null; chargeCodeId: string; amount: Prisma.Decimal }[] };

/**
 * Baris buying milik bill. Bill lama (sebelum ada tautan billId) dicocokkan lewat vendor, job, charge, dan nilai yang sama,
 * yang sudah di-bill tapi belum milik bill lain. Bila ada baris yang tidak ketemu, bill tidak diubah otomatis. Hanya membaca.
 */
export async function billCostingIds(db: Db, bill: BillForLink): Promise<{ ids: string[]; legacy: boolean }> {
  const linked = await db.costingLine.findMany({ where: { billId: bill.id }, select: { id: true } });
  if (linked.length) return { ids: linked.map((l) => l.id), legacy: false };
  const taken: string[] = [];
  for (const l of bill.lines) {
    const match = l.jobId
      ? await db.costingLine.findFirst({
          where: {
            side: "BUYING", billed: true, billId: null, vendorId: bill.vendorId, jobId: l.jobId, chargeCodeId: l.chargeCodeId,
            actualIdr: l.amount, id: { notIn: taken },
          },
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          select: { id: true },
        })
      : null;
    if (!match) throw new Error("Sebagian biaya di bill lama ini tidak bisa dicocokkan dengan costing job-nya, jadi bill tidak bisa diubah otomatis. Hubungi admin.");
    taken.push(match.id);
  }
  return { ids: taken, legacy: true };
}

/** Simpan tautan bill lama ke baris buying-nya sebelum diedit atau dibatalkan. */
async function linkBillCostings(tx: Prisma.TransactionClient, bill: BillForLink) {
  const r = await billCostingIds(tx, bill);
  if (r.legacy) await tx.costingLine.updateMany({ where: { id: { in: r.ids } }, data: { billId: bill.id } });
}

/**
 * Edit vendor bill yang belum dibayar: pilihan biaya, tanggal (bulan yang sama), jatuh tempo, no. tagihan vendor,
 * kurs, PPN, dan PPh. Nomor bill dan nomor jurnal tetap; biaya yang dilepas bisa di-bill lagi.
 */
export async function updateBillCore(db: PrismaClient, billId: string, lineIds: string[], opts: BillOpts = {}) {
  if (lineIds.length === 0) throw new Error("Pilih minimal satu biaya.");
  return db.$transaction(async (tx) => {
    const { bill, editBlock } = await billChangeState(tx, billId);
    if (editBlock) throw new Error(editBlock);
    if (!bill.journalEntryId) throw new Error("Bill ini tidak punya jurnal, jadi tidak bisa diedit.");
    await linkBillCostings(tx, bill);

    const lines = await tx.costingLine.findMany({
      where: { id: { in: lineIds }, side: "BUYING" },
      include: { chargeCode: true, job: { select: { status: true } } },
      orderBy: [{ jobId: "asc" }, { sortOrder: "asc" }],
    });
    if (lines.length !== lineIds.length) throw new Error("Ada biaya yang tidak ditemukan. Muat ulang halaman.");
    if (lines.some((l) => l.vendorId !== bill.vendorId)) throw new Error("Satu bill hanya untuk satu vendor.");
    const added = lines.filter((l) => l.billId !== bill.id);
    if (added.some((l) => l.billed || l.voucherId || l.recordedAt)) throw new Error("Ada biaya yang sudah di-bill atau masuk voucher lain. Muat ulang halaman.");
    if (added.some((l) => l.job.status === "CANCELLED")) throw new Error("Ada job yang sudah dibatalkan.");

    const date = opts.date ? billDate(opts.date) : bill.date;
    if (jktKey(date).slice(0, 7) !== jktKey(bill.date).slice(0, 7)) throw new Error("Tanggal bill tidak bisa pindah bulan, karena bulan ada di nomor bill.");
    const cur = (opts.currency || bill.currency).toUpperCase();
    const rate = cur === bill.currency && !(Number(opts.rate) > 0) ? Number(bill.exchangeRate) : opts.rate;
    const a = await billAmounts(tx, lines, { ...opts, currency: cur, rate });
    const acc = await accountMap(tx);
    const { fields, lineData, jLines } = billPosting(lines, a, acc, bill.number, bill.vendor.name);

    await tx.costingLine.updateMany({ where: { billId: bill.id, id: { notIn: lineIds } }, data: { billed: false, billId: null } });
    const marked = await tx.costingLine.updateMany({
      where: { id: { in: lineIds }, OR: [{ billId: bill.id }, { billed: false, voucherId: null, recordedAt: null }] },
      data: { billed: true, billId: bill.id },
    });
    if (marked.count !== lineIds.length) throw new Error("Biaya ini baru saja dipakai bill atau voucher lain. Muat ulang halaman.");
    await tx.billLine.deleteMany({ where: { billId: bill.id } });
    await tx.vendorBill.update({
      where: { id: bill.id },
      data: {
        jobId: lines[0].jobId, date, postedAt: date,
        ...(opts.dueDate ? { dueDate: billDate(opts.dueDate) } : {}),
        ...(opts.vendorRef !== undefined ? { vendorRef: (opts.vendorRef ?? "").trim() || null } : {}),
        ...fields, amountPaidForeign: new Prisma.Decimal(0), lines: { create: lineData },
      },
    });
    const changes = await replaceJournal(tx, bill.journalEntryId, { date, description: `Vendor Bill ${bill.number} - ${bill.vendor.name}`, lines: jLines });
    return { number: bill.number, changes };
  });
}

/**
 * Batalkan vendor bill yang belum dibayar. Jurnal hutang dibalik di tanggal bill, bill ditandai batal dengan alasannya,
 * dan biaya job milik bill ini dibuka kembali sehingga bisa di-bill ulang. Nomor bill tetap tercatat.
 */
export async function cancelBillCore(db: PrismaClient, billId: string, reason: string, userId?: string) {
  const why = reason.trim();
  if (why.length < 3) throw new Error("Alasan pembatalan wajib diisi.");
  return db.$transaction(async (tx) => {
    const { bill, cancelBlock } = await billChangeState(tx, billId);
    if (cancelBlock) throw new Error(cancelBlock);
    await linkBillCostings(tx, bill);
    const marked = await tx.vendorBill.updateMany({
      where: { id: bill.id, status: { not: "CANCELLED" } },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: why },
    });
    if (marked.count === 0) throw new Error("Bill ini sudah dibatalkan.");
    if (bill.journalEntryId) await reverseJournal(tx, bill.journalEntryId, { date: bill.date, reason: `Bill dibatalkan: ${why}`, createdById: userId });
    const reopened = await tx.costingLine.updateMany({ where: { billId: bill.id }, data: { billed: false, billId: null } });
    return { number: bill.number, reopened: reopened.count };
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
  if (bill.currency === IDR) return recordVendorPaymentMultiTx(tx, [{ billId: bill.id, amount: Number(input.amount) }], input, userId);
  const date = input.date ? new Date(`${input.date}T12:00:00+07:00`) : new Date();

  const acc = await accountMap(tx);
  const cash = await resolveCashAccount(tx, input.bankAccountId, "payment");
  assertCashCurrency(cash, bill.currency, "pembayaran bill");
  const number = await genProofNumber(tx, cashProofCode(cash.kind, "OUT"), date);
  const outIdr = r2(Number(bill.total) - Number(bill.amountPaid));

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

/**
 * Satu pembayaran untuk beberapa bill IDR dari vendor yang sama (mis. vendor mengirim beberapa invoice, dibayar
 * sekali transfer). Satu nomor bukti dan satu jurnal: debit hutang per bill, kredit kas/bank sebesar totalnya.
 */
export async function recordVendorPaymentMultiTx(
  tx: Prisma.TransactionClient, items: { billId: string; amount: number }[], input: Omit<VendorPaymentInput, "amount" | "amountForeign" | "paymentRate">, userId?: string,
): Promise<PaymentRecorded> {
  if (items.length === 0) throw new Error("Pilih minimal satu bill.");
  if (new Set(items.map((i) => i.billId)).size !== items.length) throw new Error("Ada bill yang dipilih dua kali.");
  const bills = await tx.vendorBill.findMany({ where: { id: { in: items.map((i) => i.billId) } }, include: { vendor: true } });
  const rows = items.map((i) => {
    const bill = bills.find((b) => b.id === i.billId);
    if (!bill) throw new Error("Bill tidak ditemukan.");
    if (bill.status === "CANCELLED") throw new Error(`${bill.number} sudah dibatalkan.`);
    if (bill.status === "PAID") throw new Error(`${bill.number} sudah lunas.`);
    if (bill.currency !== IDR) throw new Error(`${bill.number} bill valas, bayar terpisah.`);
    const amount = r2(Number(i.amount));
    if (!(amount > 0)) throw new Error(items.length > 1 ? `Nominal ${bill.number} harus lebih dari 0.` : "Nominal harus lebih dari 0.");
    const out = r2(Number(bill.total) - Number(bill.amountPaid));
    if (amount > out + 0.5) throw new Error(items.length > 1 ? `Nominal ${bill.number} melebihi sisa hutang (${out}).` : `Melebihi sisa hutang (${out}).`);
    return { bill, amount };
  });
  const vendor = rows[0].bill.vendor;
  if (rows.some((r) => r.bill.vendorId !== vendor.id)) throw new Error("Satu pembayaran hanya untuk bill dari vendor yang sama.");
  const date = input.date ? new Date(`${input.date}T12:00:00+07:00`) : new Date();
  const acc = await accountMap(tx);
  const cash = await resolveCashAccount(tx, input.bankAccountId, "payment");
  assertCashCurrency(cash, IDR, "pembayaran bill");
  const number = await genProofNumber(tx, cashProofCode(cash.kind, "OUT"), date);
  const total = r2(rows.reduce((s, r) => s + r.amount, 0));

  const pay = await tx.payment.create({
    data: {
      number, direction: "PAYMENT", date, vendorId: vendor.id,
      method: (input.method as any) ?? "TRANSFER", reference: input.reference, currency: IDR, bankAccountId: cash.bankAccountId,
      amount: new Prisma.Decimal(total),
      allocations: { create: rows.map((r) => ({ billId: r.bill.id, amount: new Prisma.Decimal(r.amount) })) },
    },
  });
  const jeId = await postJournal(tx, {
    date, description: `Pembayaran ${number} - ${vendor.name}`, source: "PAYMENT", sourceId: pay.id,
    lines: [
      ...rows.map((r) => ({ accountId: acc[ACC.AP], debit: r.amount, description: `Pelunasan ${r.bill.number}${r.bill.vendorRef ? ` (Inv ${r.bill.vendorRef})` : ""}` })),
      { accountId: cash.coaId, credit: total, description: `Pembayaran dari ${cash.name}` },
    ],
    createdById: userId, number,
  });
  await tx.payment.update({ where: { id: pay.id }, data: { journalEntryId: jeId } });
  for (const r of rows) {
    const newPaid = r2(Number(r.bill.amountPaid) + r.amount);
    await tx.vendorBill.update({
      where: { id: r.bill.id },
      data: { amountPaid: new Prisma.Decimal(newPaid), status: newPaid >= Number(r.bill.total) - 0.5 ? "PAID" : "PARTIAL" },
    });
  }
  return { paymentId: pay.id, number, journalEntryId: jeId };
}

/** Bill IDR yang belum lunas per vendor, untuk pilihan "bayar sekalian" di dialog Bayar. */
export async function openIdrBillsByVendor(db: PrismaClient, vendorIds: string[]) {
  const rows = vendorIds.length ? await db.vendorBill.findMany({
    where: { vendorId: { in: [...new Set(vendorIds)] }, currency: IDR, status: { in: ["UNPAID", "PARTIAL"] } },
    orderBy: [{ dueDate: "asc" }, { number: "asc" }],
    select: { id: true, number: true, vendorRef: true, vendorId: true, total: true, amountPaid: true },
  }) : [];
  const out: Record<string, { id: string; number: string; vendorRef: string | null; outstanding: number }[]> = {};
  for (const b of rows) (out[b.vendorId] ??= []).push({ id: b.id, number: b.number, vendorRef: b.vendorRef, outstanding: r2(Number(b.total) - Number(b.amountPaid)) });
  return out;
}

/** Pembayaran ke vendor dalam transaksinya sendiri. */
export async function recordVendorPaymentCore(db: PrismaClient, billId: string, input: VendorPaymentInput, userId?: string): Promise<PaymentRecorded> {
  return db.$transaction((tx) => recordVendorPaymentTx(tx, billId, input, userId));
}

/** Pembayaran beberapa bill IDR satu vendor dalam transaksinya sendiri. */
export async function recordVendorPaymentMultiCore(db: PrismaClient, items: { billId: string; amount: number }[], input: Omit<VendorPaymentInput, "amount" | "amountForeign" | "paymentRate">, userId?: string): Promise<PaymentRecorded> {
  return db.$transaction((tx) => recordVendorPaymentMultiTx(tx, items, input, userId));
}

type Db = PrismaClient | Prisma.TransactionClient;

/** Alasan pembayaran vendor bill tidak bisa dibatalkan, atau null bila bisa. Murni. */
export function vendorPaymentCancelBlock(p: {
  direction: string; hasBill: boolean; cancelledAt: Date | null; date: Date; closedMonths: string[];
  reconciled: boolean; reconciledAt: Date | null; fxRevalAfter: boolean; voucherNumber: string | null;
}): string | null {
  if (p.direction !== "PAYMENT" || !p.hasBill) return "Yang bisa dibatalkan di sini hanya pembayaran vendor bill.";
  if (p.cancelledAt) return "Pembayaran ini sudah dibatalkan.";
  if (p.voucherNumber) return `Pembayaran ini tercatat lewat voucher ${p.voucherNumber}. Koreksi lewat Jurnal Umum.`;
  if (p.reconciled) {
    const when = p.reconciledAt ? ` pada ${formatDate(p.reconciledAt)}` : "";
    return `Pembayaran ini sudah direkonsiliasi${when}. Buka dulu rekonsiliasinya di menu Rekonsiliasi Bank.`;
  }
  if (isClosedKey(p.closedMonths, jktKey(p.date))) return closedMessage(jktKey(p.date));
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
    closedMonths: await getClosedMonths(db), reconciled: recon.length > 0, reconciledAt: recon.find((l) => l.reconciledAt)?.reconciledAt ?? null,
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
