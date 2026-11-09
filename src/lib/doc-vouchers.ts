import { Prisma, type PrismaClient } from "@prisma/client";
import { r2 } from "./accounting-core";
import { genProofNumber } from "./sequence";
import { IDR } from "./fx";
import { normalizeDeductions, type Deductions } from "./receipt-deductions";
import { recordReceiptTx } from "./receivables";
import { recordVendorPaymentTx } from "./payables";

/**
 * Voucher dari invoice atau vendor bill: user mencentang baris dokumen (mis. per job), dan voucher itu sekaligus
 * mencatat pembayarannya (uang masuk untuk invoice, uang keluar untuk bill) memakai logika pembayaran yang sudah ada.
 * Satu baris hanya boleh ada di satu voucher (dijaga juga oleh unique di VoucherDocLine). Pajak dokumen ikut
 * sebagai baris sendiri di voucher yang memuat baris pertama dokumen, sehingga semua voucher = nilai dokumen.
 */

export type DocLine = { id: string; amount: number };

/** Nilai voucher dari baris yang dicentang. `lines` berurutan seperti dokumen; baris pertama membawa pajak. */
export function docVoucherAmount(input: { lines: DocLine[]; picked: string[]; ppn: number; pph: number }) {
  const picked = [...new Set(input.picked)];
  if (picked.length === 0) throw new Error("Pilih minimal satu baris.");
  const byId = new Map(input.lines.map((l) => [l.id, l]));
  if (picked.some((id) => !byId.has(id))) throw new Error("Ada baris yang bukan milik dokumen ini. Muat ulang halaman.");
  const base = r2(picked.reduce((s, id) => s + byId.get(id)!.amount, 0));
  const carriesTax = picked.includes(input.lines[0]?.id);
  const ppn = carriesTax ? r2(input.ppn) : 0;
  const pph = carriesTax ? r2(input.pph) : 0;
  const total = r2(base + ppn - pph);
  if (!(total > 0)) throw new Error("Nilai voucher harus lebih dari 0.");
  return { picked, base, ppn, pph, total, carriesTax };
}

/** Dokumen yang boleh divoucher: IDR, belum batal atau lunas, dan nilai voucher tidak melebihi sisa. */
export function validateDocVoucher(doc: { status: string; currency: string; total: unknown; amountPaid: unknown }, amount: number, label: "Invoice" | "Bill") {
  if (doc.status === "CANCELLED") throw new Error(`${label} sudah dibatalkan.`);
  if (doc.status === "PAID") throw new Error(`${label} sudah lunas.`);
  if (doc.currency !== IDR) {
    throw new Error(`Voucher baru untuk ${label.toLowerCase()} IDR. ${label} ${doc.currency} dicatat lewat ${label === "Invoice" ? "Catat Pembayaran" : "Bayar"}.`);
  }
  const outstanding = r2(Number(doc.total) - Number(doc.amountPaid));
  if (amount > outstanding + 0.5) {
    throw new Error(`Nilai voucher (${amount}) melebihi sisa ${label.toLowerCase()} (${outstanding}). Kemungkinan sudah ada pembayaran di luar voucher; catat sisanya lewat ${label === "Invoice" ? "Catat Pembayaran" : "Bayar"}.`);
  }
  return outstanding;
}

export type DocVoucherInput = {
  lineIds: string[]; dateKey: string; bankAccountId: string;
  method?: string | null; reference?: string | null; notes?: string | null;
};
export type InvoiceVoucherInput = DocVoucherInput & { invoiceId: string; deductions?: Deductions };
export type BillVoucherInput = DocVoucherInput & { billId: string };

/** "YYYY-MM-DD" yang benar-benar ada di kalender (2026-13-01 dan 2026-02-30 ditolak). */
const isDateKey = (k: string) => /^\d{4}-\d{2}-\d{2}$/.test(k) && !Number.isNaN(Date.parse(`${k}T00:00:00Z`)) && new Date(`${k}T00:00:00Z`).toISOString().slice(0, 10) === k;
const dateOf = (key: string) => new Date(`${key}T12:00:00+07:00`);

function checkCommon(input: DocVoucherInput) {
  if (!isDateKey(input.dateKey ?? "")) throw new Error("Tanggal tidak valid.");
  if (!input.bankAccountId) throw new Error("Pilih kas atau rekening.");
  return {
    method: input.method || "TRANSFER", reference: (input.reference ?? "").trim() || null, notes: (input.notes ?? "").trim() || null,
  };
}

/** Baris yang sudah masuk voucher lain ditolak dengan nomor vouchernya. */
function assertFree(lines: { id: string; voucherLine: { voucher: { number: string } } | null }[], picked: string[]) {
  const used = lines.filter((l) => picked.includes(l.id) && l.voucherLine);
  if (used.length) throw new Error(`Ada baris yang sudah masuk voucher ${[...new Set(used.map((l) => l.voucherLine!.voucher.number))].join(", ")}. Muat ulang halaman.`);
}

/** Unique VoucherDocLine dilanggar = dua user menyimpan baris yang sama bersamaan. */
function friendly(e: unknown): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
    throw new Error("Baris ini baru saja dipakai voucher lain. Muat ulang halaman.");
  }
  throw e;
}

const USED = { select: { voucher: { select: { number: true } } } } as const;

/** Voucher dari invoice: mencatat penerimaan (BM/KM) atas baris yang dicentang, dengan potongan bila ada. */
export async function createInvoiceVoucher(db: PrismaClient, input: InvoiceVoucherInput, userId?: string) {
  const c = checkCommon(input);
  try {
    return await db.$transaction(async (tx) => {
      const inv = await tx.invoice.findUnique({
        where: { id: input.invoiceId },
        include: { customer: { select: { name: true } }, lines: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: { id: true, amount: true, voucherLine: USED } } },
      });
      if (!inv) throw new Error("Invoice tidak ditemukan.");
      assertFree(inv.lines, input.lineIds);
      const a = docVoucherAmount({ lines: inv.lines.map((l) => ({ id: l.id, amount: Number(l.amount) })), picked: input.lineIds, ppn: Number(inv.ppnAmount), pph: 0 });
      validateDocVoucher(inv, a.total, "Invoice");
      const ded = normalizeDeductions(input.deductions);
      const cash = r2(a.total - ded.total);
      if (!(cash > 0)) throw new Error("Potongan tidak boleh sama dengan atau melebihi nilai voucher.");
      const paid = await recordReceiptTx(tx, inv.id, {
        amount: cash, date: input.dateKey, method: c.method, reference: c.reference ?? undefined, deductions: input.deductions, bankAccountId: input.bankAccountId,
      }, userId);
      return saveVoucher(tx, {
        kind: "INVOICE", invoiceId: inv.id, payee: inv.customer.name, dateKey: input.dateKey, total: a.total, deductions: ded.total,
        carriesTax: a.carriesTax, picked: a.picked, amounts: new Map(inv.lines.map((l) => [l.id, Number(l.amount)])), c, paid, userId,
      });
    });
  } catch (e) { return friendly(e); }
}

/** Voucher dari vendor bill: mencatat pembayaran (BK/KK) atas baris yang dicentang. */
export async function createBillVoucher(db: PrismaClient, input: BillVoucherInput, userId?: string) {
  const c = checkCommon(input);
  try {
    return await db.$transaction(async (tx) => {
      const bill = await tx.vendorBill.findUnique({
        where: { id: input.billId },
        include: { vendor: { select: { name: true } }, lines: { orderBy: { id: "asc" }, select: { id: true, amount: true, voucherLine: USED } } },
      });
      if (!bill) throw new Error("Bill tidak ditemukan.");
      assertFree(bill.lines, input.lineIds);
      const a = docVoucherAmount({
        lines: bill.lines.map((l) => ({ id: l.id, amount: Number(l.amount) })), picked: input.lineIds,
        ppn: Number(bill.ppnAmount), pph: Number(bill.pph23Amount) + Number(bill.pph26Amount),
      });
      validateDocVoucher(bill, a.total, "Bill");
      const paid = await recordVendorPaymentTx(tx, bill.id, {
        amount: a.total, date: input.dateKey, method: c.method, reference: c.reference ?? undefined, bankAccountId: input.bankAccountId,
      }, userId);
      return saveVoucher(tx, {
        kind: "BILL", billId: bill.id, payee: bill.vendor.name, dateKey: input.dateKey, total: a.total, deductions: 0,
        carriesTax: a.carriesTax, picked: a.picked, amounts: new Map(bill.lines.map((l) => [l.id, Number(l.amount)])), c, paid, userId,
      });
    });
  } catch (e) { return friendly(e); }
}

async function saveVoucher(tx: Prisma.TransactionClient, v: {
  kind: "INVOICE" | "BILL"; invoiceId?: string; billId?: string; payee: string; dateKey: string; total: number; deductions: number;
  carriesTax: boolean; picked: string[]; amounts: Map<string, number>; c: ReturnType<typeof checkCommon>;
  paid: { paymentId: string; number: string; journalEntryId: string }; userId?: string;
}) {
  const date = dateOf(v.dateKey);
  const payment = await tx.payment.findUniqueOrThrow({ where: { id: v.paid.paymentId }, select: { bankAccountId: true } });
  const number = await genProofNumber(tx, "VC", date);
  const voucher = await tx.voucher.create({
    data: {
      number, kind: v.kind, invoiceId: v.invoiceId ?? null, billId: v.billId ?? null, date, payee: v.payee, notes: v.c.notes,
      total: new Prisma.Decimal(v.total), deductions: new Prisma.Decimal(v.deductions), carriesTax: v.carriesTax,
      status: "PAID", paidAt: date, method: v.c.method, reference: v.c.reference, bankAccountId: payment.bankAccountId,
      proofNumber: v.paid.number, journalEntryId: v.paid.journalEntryId, paymentId: v.paid.paymentId, createdById: v.userId,
      docLines: {
        create: v.picked.map((id) => ({
          ...(v.kind === "INVOICE" ? { invoiceLineId: id } : { billLineId: id }), amount: new Prisma.Decimal(v.amounts.get(id) ?? 0),
        })),
      },
    },
  });
  return { id: voucher.id, number, proofNumber: v.paid.number };
}

// ---------------------------------------------------------------- data form dan halaman detail

export type DocForVoucher = {
  id: string; number: string; party: string; date: string; status: string; total: number; outstanding: number;
  ppn: number; pph: number;
  lines: { id: string; label: string; note: string | null; job: string | null; amount: number; reimburse: boolean; voucher: string | null }[];
};

const OPEN_INVOICE = ["UNPAID", "PARTIAL", "OVERDUE"] as const;
const OPEN_BILL = ["UNPAID", "PARTIAL"] as const;
const MAX_DOCS = 30;
const ci = (t: string) => ({ contains: t, mode: "insensitive" as const });
const jobText = (t: string) => ({ OR: [{ number: ci(t) }, { hblNo: ci(t) }, { mblNo: ci(t) }, { hawbNo: ci(t) }, { mawbNo: ci(t) }] });

/**
 * Invoice IDR yang belum lunas untuk form voucher, terbaru dulu (maks. 30). Pencarian: no. invoice, customer, job, B/L.
 * `focusId` (dari tombol di detail invoice) selalu ikut ditampilkan paling atas.
 */
export async function invoicesForVoucher(db: PrismaClient, q = "", focusId?: string | null): Promise<DocForVoucher[]> {
  const t = q.trim().slice(0, 60);
  const rows = await db.invoice.findMany({
    where: {
      OR: [
        ...(focusId ? [{ id: focusId }] : []),
        {
          status: { in: [...OPEN_INVOICE] }, currency: IDR,
          ...(t ? { OR: [{ number: ci(t) }, { customer: { name: ci(t) } }, { lines: { some: { job: jobText(t) } } }] } : {}),
        },
      ],
    },
    orderBy: [{ date: "desc" }, { number: "desc" }],
    take: MAX_DOCS,
    include: {
      customer: { select: { name: true } }, job: { select: { number: true } },
      lines: {
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        include: { chargeCode: { select: { code: true, name: true } }, job: { select: { number: true } }, voucherLine: USED },
      },
    },
  });
  const docs = rows.map((i): DocForVoucher => ({
    id: i.id, number: i.number, party: i.customer.name, date: i.date.toISOString(), status: i.status,
    total: Number(i.total), outstanding: r2(Number(i.total) - Number(i.amountPaid)), ppn: Number(i.ppnAmount), pph: 0,
    lines: i.lines.map((l) => ({
      id: l.id, label: `${l.chargeCode.code} ${l.chargeCode.name}`, note: l.description && l.description !== l.chargeCode.name ? l.description : null,
      job: l.job?.number ?? i.job?.number ?? null, amount: Number(l.amount), reimburse: l.asReceipt, voucher: l.voucherLine?.voucher.number ?? null,
    })),
  }));
  return focusId ? [...docs.filter((d) => d.id === focusId), ...docs.filter((d) => d.id !== focusId)] : docs;
}

/** Vendor bill IDR yang belum lunas untuk form voucher. Pencarian: no. bill, ref. vendor, vendor, job, B/L. */
export async function billsForVoucher(db: PrismaClient, q = "", focusId?: string | null): Promise<DocForVoucher[]> {
  const t = q.trim().slice(0, 60);
  const rows = await db.vendorBill.findMany({
    where: {
      OR: [
        ...(focusId ? [{ id: focusId }] : []),
        {
          status: { in: [...OPEN_BILL] }, currency: IDR,
          ...(t ? { OR: [{ number: ci(t) }, { vendorRef: ci(t) }, { vendor: { name: ci(t) } }, { lines: { some: { job: jobText(t) } } }] } : {}),
        },
      ],
    },
    orderBy: [{ date: "desc" }, { number: "desc" }],
    take: MAX_DOCS,
    include: {
      vendor: { select: { name: true } }, job: { select: { number: true } },
      lines: { orderBy: { id: "asc" }, include: { chargeCode: { select: { code: true, name: true, asReceipt: true } }, job: { select: { number: true } }, voucherLine: USED } },
    },
  });
  const docs = rows.map((b): DocForVoucher => ({
    id: b.id, number: b.vendorRef ? `${b.number} · ${b.vendorRef}` : b.number, party: b.vendor.name, date: b.date.toISOString(), status: b.status,
    total: Number(b.total), outstanding: r2(Number(b.total) - Number(b.amountPaid)),
    ppn: Number(b.ppnAmount), pph: r2(Number(b.pph23Amount) + Number(b.pph26Amount)),
    lines: b.lines.map((l) => ({
      id: l.id, label: `${l.chargeCode.code} ${l.chargeCode.name}`, note: l.description && l.description !== l.chargeCode.name ? l.description : null,
      job: l.job?.number ?? b.job?.number ?? null, amount: Number(l.amount), reimburse: l.chargeCode.asReceipt, voucher: l.voucherLine?.voucher.number ?? null,
    })),
  }));
  return focusId ? [...docs.filter((d) => d.id === focusId), ...docs.filter((d) => d.id !== focusId)] : docs;
}

const JOB_NO = { select: { number: true } } as const;
type JobNo = { job: { number: string } | null } | null;

/** Job baris voucher dokumen. Baris tanpa job (data lama) ikut job di kepala invoice/bill. */
export function docLineJobs(v: { invoice: JobNo; bill: JobNo; docLines: { invoiceLine: JobNo; billLine: JobNo }[] }): string {
  const head = (v.invoice ?? v.bill)?.job?.number ?? null;
  return [...new Set(v.docLines.map((d) => (d.invoiceLine ?? d.billLine)?.job?.number ?? head).filter((x): x is string => !!x))].join(", ");
}

export type DocVoucherSummary = { id: string; number: string; date: string; total: number; proofNumber: string | null; jobs: string; lineCount: number };

/** Voucher milik satu invoice atau bill, untuk kartu di halaman detail. */
export async function vouchersOfDoc(db: PrismaClient, where: { invoiceId: string } | { billId: string }): Promise<DocVoucherSummary[]> {
  const rows = await db.voucher.findMany({
    where, orderBy: [{ date: "asc" }, { number: "asc" }],
    include: { invoice: { select: { job: JOB_NO } }, bill: { select: { job: JOB_NO } }, docLines: { include: { invoiceLine: { select: { job: JOB_NO } }, billLine: { select: { job: JOB_NO } } } } },
  });
  return rows.map((v) => ({
    id: v.id, number: v.number, date: v.date.toISOString(), total: Number(v.total), proofNumber: v.proofNumber, lineCount: v.docLines.length,
    jobs: docLineJobs(v),
  }));
}
