import { Prisma, type PrismaClient } from "@prisma/client";
import { accountMap, ACC } from "./coa";
import { jktKey, PPN_RATE, r2 } from "./accounting-core";
import { postJournal, reverseJournal, type JournalLineInput } from "./journal";
import { normalizeDeductions, type Deductions } from "./receipt-deductions";
import { resolveCashAccount, assertCashCurrency } from "./cash-accounts";
import { genDocNumber, SEQ } from "./sequence";
import { effectiveRate, IDR, latestRate } from "./fx";

export type InvoiceOpts = { currency?: string; rate?: number };

/**
 * AR invoice dari selling costing job. Mata uang default IDR.
 * Untuk valas: nilai IDR tetap (sesuai costing), nominal valas = IDR / kurs tagihan.
 */
export async function createInvoiceFromJobCore(db: PrismaClient, jobId: string, userId?: string, opts: InvoiceOpts = {}): Promise<string> {
  const job = await db.job.findUnique({
    where: { id: jobId },
    // Hanya baris selling yang belum ditagih, supaya satu baris tidak masuk ke dua invoice.
    include: { customer: true, costings: { where: { side: "SELLING", invoiced: false }, include: { chargeCode: true }, orderBy: { sortOrder: "asc" } } },
  });
  if (!job) throw new Error("Job tidak ditemukan.");
  if (job.costings.length === 0) {
    const any = await db.costingLine.count({ where: { jobId, side: "SELLING" } });
    throw new Error(any > 0 ? "Semua selling charge job ini sudah ditagih. Tambah selling charge baru atau batalkan invoice sebelumnya." : "Tidak ada selling charge untuk ditagih.");
  }

  const cur = (opts.currency || IDR).toUpperCase();
  let rate = 1;
  if (cur !== IDR) {
    rate = Number(opts.rate) > 0 ? Number(opts.rate) : (effectiveRate(job.costings, cur) ?? (await latestRate(db, cur)) ?? 0);
    if (!(rate > 0)) throw new Error(`Kurs ${cur} belum tersedia. Isi kurs tagihan secara manual.`);
  }

  return db.$transaction(async (tx) => {
    const acc = await accountMap(tx);
    const date = new Date();
    const dueDate = new Date(date);
    dueDate.setDate(dueDate.getDate() + (job.customer.termOfPayment ?? 30));

    let subtotal = 0, taxableBase = 0;
    const lineData: Prisma.InvoiceLineCreateManyInvoiceInput[] = [];
    const revByAccount: Record<string, number> = {};
    for (const [i, c] of job.costings.entries()) {
      const amount = Number(c.actualIdr);
      subtotal += amount;
      if (c.taxable) taxableBase += amount;
      const accId = c.chargeCode.revenueAccountId ?? acc[ACC.REV_OTHER];
      revByAccount[accId] = r2((revByAccount[accId] ?? 0) + amount);
      lineData.push({
        chargeCodeId: c.chargeCodeId, description: c.chargeCode.name,
        qty: c.qty, unitPrice: new Prisma.Decimal(amount / (Number(c.qty) || 1)),
        amount: new Prisma.Decimal(amount), taxable: c.taxable,
        // Snapshot untuk cetakan: kelompok, as receipt, satuan, dan keterangan baris.
        section: c.chargeCode.invoiceSection, asReceipt: c.asReceipt, unitLabel: c.unitLabel,
        note: c.description && c.description !== c.chargeCode.code ? c.description : null, sortOrder: i,
      });
    }
    subtotal = r2(subtotal); taxableBase = r2(taxableBase);
    const ppn = r2(taxableBase * PPN_RATE);
    const total = r2(subtotal + ppn);
    const foreignTotal = cur === IDR ? 0 : r2(total / rate);
    // kurs tercatat = IDR tercatat / nominal valas (konsisten dengan pembulatan nominal valas)
    const effRate = foreignTotal > 0 ? Number((total / foreignTotal).toFixed(6)) : 1;

    const number = await genDocNumber(tx, SEQ.INVOICE, date);
    const inv = await tx.invoice.create({
      data: {
        number, jobId: job.id, customerId: job.customerId, date, dueDate,
        currency: cur, exchangeRate: new Prisma.Decimal(effRate.toFixed(6)),
        amountForeign: new Prisma.Decimal(foreignTotal), amountPaidForeign: new Prisma.Decimal(0),
        subtotal: new Prisma.Decimal(subtotal), taxableBase: new Prisma.Decimal(taxableBase),
        ppnAmount: new Prisma.Decimal(ppn), total: new Prisma.Decimal(total), status: "UNPAID", postedAt: date,
        lines: { create: lineData },
      },
    });

    const jLines: { accountId: string; debit?: number; credit?: number; description?: string }[] = [
      { accountId: acc[ACC.AR], debit: total, description: `Invoice ${number}` },
    ];
    for (const [accId, amt] of Object.entries(revByAccount)) jLines.push({ accountId: accId, credit: amt });
    if (ppn > 0) jLines.push({ accountId: acc[ACC.PPN_OUT], credit: ppn, description: "PPN Keluaran" });
    const jeId = await postJournal(tx, {
      date, description: `AR Invoice ${number} - ${job.customer.name}`, source: "INVOICE", sourceId: inv.id, lines: jLines, createdById: userId,
    });
    await tx.invoice.update({ where: { id: inv.id }, data: { journalEntryId: jeId } });
    // Tandai per baris yang ditagih. Syarat invoiced=false mencegah dua invoice bersamaan menagih baris yang sama.
    const marked = await tx.costingLine.updateMany({ where: { id: { in: job.costings.map((c) => c.id) }, invoiced: false }, data: { invoiced: true, invoiceId: inv.id } });
    if (marked.count !== job.costings.length) throw new Error("Selling charge job ini baru saja ditagih oleh invoice lain. Muat ulang halaman.");
    return inv.id;
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
    const number = await genDocNumber(tx, SEQ.RECEIPT, date);
    const cash = await resolveCashAccount(tx, input.bankAccountId, "receipt");
    assertCashCurrency(cash, inv.currency, "penerimaan invoice");

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
      if (ded.other > 0) lines.push({ accountId: acc[ACC.EXP_OPS_OTHER], debit: ded.other, description: "Potongan / biaya lain" });
      lines.push({ accountId: acc[ACC.AR], credit: applied, description: `Pelunasan ${inv.number}` });
      const jeId = await postJournal(tx, {
        date, description: `Receipt ${number} - ${inv.customer.name}`, source: "RECEIPT", sourceId: pay.id,
        lines, createdById: userId,
      });
      await tx.payment.update({ where: { id: pay.id }, data: { journalEntryId: jeId } });
      const newPaid = r2(Number(inv.amountPaid) + applied);
      await tx.invoice.update({
        where: { id: inv.id },
        data: { amountPaid: new Prisma.Decimal(newPaid), status: newPaid >= Number(inv.total) - 0.5 ? "PAID" : "PARTIAL" },
      });
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
      date, description: `Receipt ${number} - ${inv.customer.name}`, source: "RECEIPT", sourceId: pay.id, lines, createdById: userId,
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
