import { Prisma, type PrismaClient } from "@prisma/client";
import { accountMap, ACC } from "./coa";
import { jktKey, r2 } from "./accounting-core";
import { postJournal, replaceJournal, reverseJournal, type JournalLineInput } from "./journal";
import { normalizeDeductions, type Deductions } from "./receipt-deductions";
import { resolveCashAccount, assertCashCurrency } from "./cash-accounts";
import { cashProofCode, genInvoiceNumber, genProofNumber } from "./sequence";
import { closeJobsOfInvoice } from "./job-lock";
import { effectiveRate, IDR, latestRate } from "./fx";

export type InvoiceOpts = { currency?: string; rate?: number; date?: string; dueDate?: string; notes?: string | null };

type Tx = Prisma.TransactionClient;
type Db = PrismaClient | Tx;
type SellingLine = Prisma.CostingLineGetPayload<{ include: { chargeCode: true } }>;

/** Tarif PPN keluaran untuk invoice baru. */
export async function getPpnRate(db: Db): Promise<number> {
  const s = await db.accountingSetting.findUnique({ where: { id: "default" }, select: { ppnRate: true } });
  return s ? Number(s.ppnRate) : 0.011;
}

/** Hitung nilai invoice. PPN hanya dari pendapatan, reimburse (as receipt) tidak dihitung. Murni. */
export function invoiceTotals(lines: { amount: number; asReceipt: boolean }[], ppnRate: number) {
  const revenue = r2(lines.filter((l) => !l.asReceipt).reduce((s, l) => s + l.amount, 0));
  const reimburse = r2(lines.filter((l) => l.asReceipt).reduce((s, l) => s + l.amount, 0));
  const subtotal = r2(revenue + reimburse);
  const ppn = r2(revenue * ppnRate);
  return { revenue, reimburse, subtotal, ppn, total: r2(subtotal + ppn) };
}

const dateOf = (key: string) => new Date(`${key}T12:00:00+07:00`);

/** Baris invoice dan baris jurnal dari baris selling. */
function invoiceContent(lines: SellingLine[], acc: Record<string, string>, ppnRate: number, number: string) {
  const totals = invoiceTotals(lines.map((c) => ({ amount: Number(c.actualIdr), asReceipt: c.asReceipt })), ppnRate);
  const lineData: Prisma.InvoiceLineCreateManyInvoiceInput[] = lines.map((c, i) => {
    const amount = Number(c.actualIdr);
    return {
      chargeCodeId: c.chargeCodeId, description: c.chargeCode.name, jobId: c.jobId,
      qty: c.qty, unitPrice: new Prisma.Decimal(amount / (Number(c.qty) || 1)),
      amount: new Prisma.Decimal(amount), taxable: !c.asReceipt,
      // Snapshot untuk cetakan: kelompok, as receipt, satuan, dan keterangan baris.
      section: c.chargeCode.invoiceSection, asReceipt: c.asReceipt, unitLabel: c.unitLabel,
      note: c.description && c.description !== c.chargeCode.code ? c.description : null, sortOrder: i,
    };
  });
  const creditByAccount: Record<string, number> = {};
  for (const c of lines) {
    const accId = c.asReceipt ? acc[ACC.REIMBURSE] : c.chargeCode.revenueAccountId ?? acc[ACC.REV_OTHER];
    creditByAccount[accId] = r2((creditByAccount[accId] ?? 0) + Number(c.actualIdr));
  }
  const jLines: JournalLineInput[] = [{ accountId: acc[ACC.AR], debit: totals.total, description: `Invoice ${number}` }];
  for (const [accountId, credit] of Object.entries(creditByAccount)) jLines.push({ accountId, credit });
  if (totals.ppn > 0) jLines.push({ accountId: acc[ACC.PPN_OUT], credit: totals.ppn, description: "PPN Keluaran" });
  return { totals, lineData, jLines };
}

function foreignFields(total: number, cur: string, rate: number) {
  const foreignTotal = cur === IDR ? 0 : r2(total / rate);
  // kurs tercatat = IDR tercatat / nominal valas (konsisten dengan pembulatan nominal valas)
  const effRate = foreignTotal > 0 ? Number((total / foreignTotal).toFixed(6)) : 1;
  return { currency: cur, exchangeRate: new Prisma.Decimal(effRate.toFixed(6)), amountForeign: new Prisma.Decimal(foreignTotal) };
}

async function resolveRate(db: Db, lines: SellingLine[], cur: string, wanted?: number) {
  if (cur === IDR) return 1;
  const rate = Number(wanted) > 0 ? Number(wanted) : (effectiveRate(lines, cur) ?? (await latestRate(db, cur)) ?? 0);
  if (!(rate > 0)) throw new Error(`Kurs ${cur} belum tersedia. Isi kurs tagihan secara manual.`);
  return rate;
}

/**
 * AR invoice dari baris selling yang dipilih. Satu invoice untuk satu job. Mata uang default IDR.
 * Untuk valas: nilai IDR tetap (sesuai costing), nominal valas = IDR / kurs tagihan.
 */
export async function createInvoiceCore(db: PrismaClient, lineIds: string[], userId?: string, opts: InvoiceOpts = {}): Promise<string> {
  if (lineIds.length === 0) throw new Error("Pilih minimal satu baris selling.");
  const lines = await db.costingLine.findMany({
    where: { id: { in: lineIds }, side: "SELLING" },
    include: { chargeCode: true, job: { include: { customer: true } } },
    orderBy: [{ jobId: "asc" }, { sortOrder: "asc" }],
  });
  if (lines.length !== lineIds.length) throw new Error("Ada baris selling yang tidak ditemukan. Muat ulang halaman.");
  if (lines.some((l) => l.invoiced)) throw new Error("Ada baris selling yang sudah ditagih. Muat ulang halaman.");
  if (lines.some((l) => l.job.status === "CANCELLED")) throw new Error("Ada job yang sudah dibatalkan.");
  if (new Set(lines.map((l) => l.jobId)).size > 1) throw new Error("Satu invoice hanya untuk satu job.");
  const job = lines[0].job;
  const cur = (opts.currency || IDR).toUpperCase();
  const rate = await resolveRate(db, lines, cur, opts.rate);

  return db.$transaction(async (tx) => {
    const acc = await accountMap(tx);
    const date = opts.date ? dateOf(opts.date) : new Date();
    const dueDate = opts.dueDate ? dateOf(opts.dueDate) : new Date(date);
    if (!opts.dueDate) dueDate.setDate(dueDate.getDate() + (job.customer.termOfPayment ?? 30));
    const ppnRate = await getPpnRate(tx);
    const number = await genInvoiceNumber(tx, date);
    const { totals, lineData, jLines } = invoiceContent(lines, acc, ppnRate, number);

    const inv = await tx.invoice.create({
      data: {
        number, jobId: job.id, customerId: job.customerId, date, dueDate, notes: opts.notes ?? null,
        ...foreignFields(totals.total, cur, rate), amountPaidForeign: new Prisma.Decimal(0),
        subtotal: new Prisma.Decimal(totals.subtotal), taxableBase: new Prisma.Decimal(totals.revenue), ppnRate: new Prisma.Decimal(ppnRate),
        ppnAmount: new Prisma.Decimal(totals.ppn), total: new Prisma.Decimal(totals.total), status: "UNPAID", postedAt: date,
        lines: { create: lineData },
      },
    });
    const jeId = await postJournal(tx, {
      date, description: `AR Invoice ${number} - ${job.customer.name}`, source: "INVOICE", sourceId: inv.id, lines: jLines, createdById: userId,
    });
    await tx.invoice.update({ where: { id: inv.id }, data: { journalEntryId: jeId } });
    // Tandai per baris yang ditagih. Syarat invoiced=false mencegah dua invoice bersamaan menagih baris yang sama.
    const marked = await tx.costingLine.updateMany({ where: { id: { in: lineIds }, invoiced: false }, data: { invoiced: true, invoiceId: inv.id } });
    if (marked.count !== lineIds.length) throw new Error("Baris selling ini baru saja ditagih oleh invoice lain. Muat ulang halaman.");
    return inv.id;
  });
}

/** Invoice dari semua baris selling job yang belum ditagih. */
export async function createInvoiceFromJobCore(db: PrismaClient, jobId: string, userId?: string, opts: InvoiceOpts = {}): Promise<string> {
  const job = await db.job.findUnique({ where: { id: jobId }, select: { id: true } });
  if (!job) throw new Error("Job tidak ditemukan.");
  const lines = await db.costingLine.findMany({ where: { jobId, side: "SELLING", invoiced: false }, select: { id: true } });
  if (lines.length === 0) {
    const any = await db.costingLine.count({ where: { jobId, side: "SELLING" } });
    throw new Error(any > 0 ? "Semua selling charge job ini sudah ditagih. Tambah selling charge baru atau batalkan invoice sebelumnya." : "Tidak ada selling charge untuk ditagih.");
  }
  return createInvoiceCore(db, lines.map((l) => l.id), userId, opts);
}

/** Alasan invoice tidak bisa diedit, atau null bila masih bisa. Murni. */
export function invoiceEditBlock(inv: { status: string; amountPaid: unknown }): string | null {
  if (inv.status === "CANCELLED") return "Invoice sudah dibatalkan.";
  if (Number(inv.amountPaid) > 0 || inv.status !== "UNPAID") return "Invoice sudah ada pembayaran, jadi tidak bisa diedit.";
  return null;
}

/**
 * Susun ulang isi invoice dari baris selling yang tertaut, nomor invoice dan nomor jurnal tetap.
 * Hanya untuk invoice yang belum dibayar.
 */
export async function rebuildInvoice(tx: Tx, invoiceId: string, opts: InvoiceOpts = {}) {
  const inv = await tx.invoice.findUnique({ where: { id: invoiceId }, include: { customer: true } });
  if (!inv) throw new Error("Invoice tidak ditemukan.");
  const block = invoiceEditBlock(inv);
  if (block) throw new Error(block);
  if (!inv.journalEntryId) throw new Error("Invoice ini tidak punya jurnal, jadi tidak bisa diedit.");
  const arLine = await tx.journalLine.findFirst({ where: { entryId: inv.journalEntryId, account: { code: ACC.AR } }, select: { debit: true } });
  if (arLine && Math.abs(Number(arLine.debit) - Number(inv.total)) > 0.5) throw new Error("Invoice sudah direvaluasi kurs, jadi tidak bisa diedit.");

  const lines = await tx.costingLine.findMany({ where: { invoiceId }, include: { chargeCode: true }, orderBy: [{ jobId: "asc" }, { sortOrder: "asc" }] });
  if (lines.length === 0) throw new Error("Invoice ini tidak tertaut ke baris selling, jadi tidak bisa diedit.");
  const date = opts.date ? dateOf(opts.date) : inv.date;
  if (jktKey(date).slice(0, 7) !== jktKey(inv.date).slice(0, 7)) throw new Error("Tanggal invoice tidak bisa pindah bulan, karena bulan ada di nomor invoice.");
  const cur = (opts.currency || inv.currency).toUpperCase();
  const rate = cur === inv.currency && !opts.rate ? Number(inv.exchangeRate) : await resolveRate(tx, lines, cur, opts.rate);

  const acc = await accountMap(tx);
  const ppnRate = Number(inv.ppnRate);
  const { totals, lineData, jLines } = invoiceContent(lines, acc, ppnRate, inv.number);
  await tx.invoiceLine.deleteMany({ where: { invoiceId } });
  await tx.invoice.update({
    where: { id: invoiceId },
    data: {
      jobId: lines[0].jobId, date, ...(opts.dueDate ? { dueDate: dateOf(opts.dueDate) } : {}), ...(opts.notes !== undefined ? { notes: opts.notes } : {}),
      ...foreignFields(totals.total, cur, rate),
      subtotal: new Prisma.Decimal(totals.subtotal), taxableBase: new Prisma.Decimal(totals.revenue),
      ppnAmount: new Prisma.Decimal(totals.ppn), total: new Prisma.Decimal(totals.total), lines: { create: lineData },
    },
  });
  return replaceJournal(tx, inv.journalEntryId, { date, description: `AR Invoice ${inv.number} - ${inv.customer.name}`, lines: jLines });
}

/** Edit invoice yang belum dibayar: ubah pilihan baris, tanggal, jatuh tempo, atau catatan. Nomor tetap. */
export async function updateInvoiceCore(db: PrismaClient, invoiceId: string, lineIds: string[], opts: InvoiceOpts = {}) {
  if (lineIds.length === 0) throw new Error("Pilih minimal satu baris selling.");
  return db.$transaction(async (tx) => {
    const inv = await tx.invoice.findUnique({ where: { id: invoiceId } });
    if (!inv) throw new Error("Invoice tidak ditemukan.");
    const block = invoiceEditBlock(inv);
    if (block) throw new Error(block);
    const chosen = await tx.costingLine.findMany({ where: { id: { in: lineIds } }, select: { jobId: true } });
    if (new Set(chosen.map((l) => l.jobId)).size > 1) throw new Error("Satu invoice hanya untuk satu job.");
    const added = await tx.costingLine.findMany({
      where: { id: { in: lineIds }, OR: [{ invoiceId: null }, { invoiceId: { not: invoiceId } }] }, include: { job: { select: { customerId: true, status: true } } },
    });
    if (added.some((l) => l.side !== "SELLING" || l.invoiced)) throw new Error("Ada baris yang sudah ditagih di invoice lain. Muat ulang halaman.");
    if (added.some((l) => l.job.customerId !== inv.customerId)) throw new Error("Satu invoice hanya untuk satu customer.");
    if (added.some((l) => l.job.status === "CANCELLED")) throw new Error("Ada job yang sudah dibatalkan.");
    await tx.costingLine.updateMany({ where: { invoiceId, id: { notIn: lineIds } }, data: { invoiced: false, invoiceId: null } });
    await tx.costingLine.updateMany({ where: { id: { in: added.map((l) => l.id) } }, data: { invoiced: true, invoiceId } });
    return rebuildInvoice(tx, invoiceId, opts);
  });
}

export type ReceiptInput = {
  amount?: number; // IDR (invoice IDR)
  amountForeign?: number; // nominal valas (invoice valas)
  paymentRate?: number; // kurs saat uang diterima (valas)
  date?: string; // YYYY-MM-DD
  method?: string;
  reference?: string;
  deductions?: Deductions; // potongan IDR: PPh 23, biaya admin bank, potongan lain (invoice IDR saja)
  bankAccountId?: string | null; // rekening penerima; kosong = rekening default penerimaan
};

/**
 * Penerimaan pembayaran invoice. Invoice valas: selisih antara IDR yang diterima
 * (nominal x kurs bayar) dan IDR yang tercatat (nominal x kurs tagihan) masuk ke 7100.
 */
export async function recordReceiptCore(db: PrismaClient, invoiceId: string, input: ReceiptInput, userId?: string): Promise<void> {
  const inv = await db.invoice.findUnique({ where: { id: invoiceId }, include: { customer: true } });
  if (!inv) throw new Error("Invoice tidak ditemukan.");
  if (inv.status === "CANCELLED") throw new Error("Invoice sudah dibatalkan.");
  const date = input.date ? new Date(`${input.date}T12:00:00+07:00`) : new Date();
  const ded = normalizeDeductions(input.deductions);
  if (ded.total > 0 && inv.currency !== IDR) throw new Error("Potongan hanya bisa dicatat untuk invoice IDR.");

  await db.$transaction(async (tx) => {
    const acc = await accountMap(tx);
    const cash = await resolveCashAccount(tx, input.bankAccountId, "receipt");
    assertCashCurrency(cash, inv.currency, "penerimaan invoice");
    const number = await genProofNumber(tx, cashProofCode(cash.kind, "IN"), date);

    if (inv.currency === IDR) {
      const amount = r2(Number(input.amount));
      if (!(amount > 0)) throw new Error("Nominal harus lebih dari 0.");
      const outstanding = r2(Number(inv.total) - Number(inv.amountPaid));
      const applied = r2(amount + ded.total); // yang melunasi tagihan: uang masuk + potongan
      if (applied > outstanding + 0.5) throw new Error(`Penerimaan dan potongan melebihi sisa tagihan (${outstanding}).`);
      if (ded.pph23 > 0 && !acc[ACC.PPH23_CLAIM]) throw new Error(`Akun PPh 23 dibayar dimuka (${ACC.PPH23_CLAIM}) belum ada di COA.`);
      if (ded.admin > 0 && !acc[ACC.EXP_BANK]) throw new Error(`Akun beban administrasi bank (${ACC.EXP_BANK}) belum ada di COA.`);
      if (ded.other > 0 && !acc[ACC.EXP_OPS_OTHER]) throw new Error(`Akun beban operasional lain (${ACC.EXP_OPS_OTHER}) belum ada di COA.`);
      const pay = await tx.payment.create({
        data: {
          number, direction: "RECEIPT", date, customerId: inv.customerId,
          method: (input.method as any) ?? "TRANSFER", reference: input.reference, currency: IDR, bankAccountId: cash.bankAccountId,
          amount: new Prisma.Decimal(amount),
          allocations: { create: [{ invoiceId: inv.id, amount: new Prisma.Decimal(applied) }] },
        },
      });
      const lines: JournalLineInput[] = [
        { accountId: cash.coaId, debit: amount, description: `Penerimaan ${cash.name}` },
      ];
      if (ded.pph23 > 0) lines.push({ accountId: acc[ACC.PPH23_CLAIM], debit: ded.pph23, description: "PPh 23 dipotong pelanggan" });
      if (ded.admin > 0) lines.push({ accountId: acc[ACC.EXP_BANK], debit: ded.admin, description: "Biaya admin bank" });
      if (ded.other > 0) lines.push({ accountId: acc[ACC.EXP_OPS_OTHER], debit: ded.other, description: ded.otherNote ?? "Potongan / biaya lain" });
      lines.push({ accountId: acc[ACC.AR], credit: applied, description: `Pelunasan ${inv.number}` });
      const jeId = await postJournal(tx, {
        date, description: `Receipt ${number} - ${inv.customer.name}`, source: "RECEIPT", sourceId: pay.id,
        lines, createdById: userId, number,
      });
      await tx.payment.update({ where: { id: pay.id }, data: { journalEntryId: jeId } });
      const newPaid = r2(Number(inv.amountPaid) + applied);
      await tx.invoice.update({
        where: { id: inv.id },
        data: { amountPaid: new Prisma.Decimal(newPaid), status: newPaid >= Number(inv.total) - 0.5 ? "PAID" : "PARTIAL" },
      });
      await closeJobsOfInvoice(tx, inv.id);
      return;
    }

    // Invoice valas
    const aF = r2(Number(input.amountForeign));
    if (!(aF > 0)) throw new Error(`Nominal ${inv.currency} harus lebih dari 0.`);
    const outF = r2(Number(inv.amountForeign) - Number(inv.amountPaidForeign));
    if (aF > outF + 0.01) throw new Error(`Melebihi sisa tagihan ${inv.currency} (${outF}).`);
    const isFull = aF >= outF - 0.005;
    const outIdr = r2(Number(inv.total) - Number(inv.amountPaid));
    const bookedIdr = isFull ? outIdr : r2(aF * Number(inv.exchangeRate));
    const payRate = Number(input.paymentRate) > 0 ? Number(input.paymentRate) : await latestRate(tx, inv.currency, jktKey(date));
    if (!(payRate && payRate > 0)) throw new Error(`Kurs ${inv.currency} untuk tanggal ini belum ada. Isi kurs pembayaran.`);
    const cashIdr = r2(aF * payRate);
    const fx = r2(cashIdr - bookedIdr);

    const pay = await tx.payment.create({
      data: {
        number, direction: "RECEIPT", date, customerId: inv.customerId,
        method: (input.method as any) ?? "TRANSFER", reference: input.reference, bankAccountId: cash.bankAccountId,
        currency: inv.currency, exchangeRate: new Prisma.Decimal(payRate.toFixed(6)),
        amount: new Prisma.Decimal(cashIdr),
        allocations: { create: [{ invoiceId: inv.id, amount: new Prisma.Decimal(bookedIdr), amountForeign: new Prisma.Decimal(aF) }] },
      },
    });
    const lines: JournalLineInput[] = [
      { accountId: cash.coaId, debit: cashIdr, description: `Penerimaan ${cash.name} ${inv.currency} ${aF}`, amountForeign: cash.currency === inv.currency ? aF : null },
      { accountId: acc[ACC.AR], credit: bookedIdr, description: `Pelunasan ${inv.number}` },
    ];
    if (fx > 0) lines.push({ accountId: acc[ACC.FX], credit: fx, description: "Laba selisih kurs" });
    if (fx < 0) lines.push({ accountId: acc[ACC.FX], debit: -fx, description: "Rugi selisih kurs" });
    const jeId = await postJournal(tx, {
      date, description: `Receipt ${number} - ${inv.customer.name}`, source: "RECEIPT", sourceId: pay.id, lines, createdById: userId, number,
    });
    await tx.payment.update({ where: { id: pay.id }, data: { journalEntryId: jeId } });
    const newPaidIdr = r2(Number(inv.amountPaid) + bookedIdr);
    const newPaidF = r2(Number(inv.amountPaidForeign) + aF);
    await tx.invoice.update({
      where: { id: inv.id },
      data: {
        amountPaid: new Prisma.Decimal(newPaidIdr),
        amountPaidForeign: new Prisma.Decimal(newPaidF),
        status: isFull || newPaidIdr >= Number(inv.total) - 0.5 ? "PAID" : "PARTIAL",
      },
    });
    await closeJobsOfInvoice(tx, inv.id);
  });
}

/**
 * Batalkan invoice yang belum menerima pembayaran: jurnal dibalik, status CANCELLED,
 * dan hanya baris selling milik invoice ini yang dibuka kembali untuk ditagih.
 */
export async function cancelInvoiceCore(db: PrismaClient, invoiceId: string, userId?: string) {
  const inv = await db.invoice.findUnique({ where: { id: invoiceId } });
  if (!inv) throw new Error("Invoice tidak ditemukan.");
  if (inv.status === "CANCELLED") throw new Error("Sudah dibatalkan.");
  if (Number(inv.amountPaid) > 0) throw new Error("Ada pembayaran, invoice tidak bisa dibatalkan.");
  if (inv.journalEntryId) {
    // Invoice valas yang sudah direvaluasi: nilai AR di jurnal asal tidak sama dengan total sekarang.
    const arLine = await db.journalLine.findFirst({ where: { entryId: inv.journalEntryId, account: { code: ACC.AR } }, select: { debit: true } });
    if (arLine && Math.abs(Number(arLine.debit) - Number(inv.total)) > 0.5) {
      throw new Error("Invoice sudah direvaluasi kurs; pembatalan belum didukung. Hubungi admin.");
    }
  }
  return db.$transaction(async (tx) => {
    if (inv.journalEntryId) await reverseJournal(tx, inv.journalEntryId, { reason: "Invoice dibatalkan", createdById: userId });
    await tx.invoice.update({ where: { id: inv.id }, data: { status: "CANCELLED" } });
    // Buka kembali hanya baris selling milik invoice ini.
    const own = await tx.costingLine.updateMany({ where: { invoiceId: inv.id }, data: { invoiced: false, invoiceId: null } });
    let reopened = own.count;
    // Data lama tanpa tautan: buka kembali hanya bila job tidak punya invoice aktif lain.
    if (own.count === 0 && inv.jobId) {
      const others = await tx.invoice.count({ where: { jobId: inv.jobId, id: { not: inv.id }, status: { not: "CANCELLED" } } });
      if (others === 0) reopened = (await tx.costingLine.updateMany({ where: { jobId: inv.jobId, side: "SELLING", invoiceId: null }, data: { invoiced: false } })).count;
    }
    return { number: inv.number, reopened };
  });
}
