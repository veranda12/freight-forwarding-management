import type { Prisma, PrismaClient } from "@prisma/client";
import { accountMap, ACC } from "./coa";
import { postJournal } from "./journal";
import { periodLabel } from "./period-lock";

type Db = PrismaClient | Prisma.TransactionClient;
type Tx = Prisma.TransactionClient;

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Akun penampung biaya yang sudah terjadi tapi tagihan vendornya belum dicatat. */
export const ACCRUED_AP = "2050";

/**
 * Jurnal akrual otomatis saat closing bulan (permintaan client 20 Nov). Biaya buying non-reimburse dari job yang sudah
 * ditagih ke customer, tapi belum dijurnal sampai akhir bulan (belum ada vendor bill, voucher belum dibayar, atau biaya
 * armada belum dicatat), dicatat sebagai beban di bulan itu: Dr beban per charge code, Cr 2050 Hutang Belum Ditagih.
 * Tanggal 1 bulan berikutnya jurnal itu dibalik otomatis, lalu tagihan asli dicatat seperti biasa di tanggal realnya.
 */

/** Batas periode "YYYY-MM": akhir bulan dan awal bulan berikutnya, jam 12 WIB supaya jatuh di tanggal yang benar. */
export function periodBounds(period: string) {
  const y = Number(period.slice(0, 4)), m = Number(period.slice(5, 7));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const nextY = m === 12 ? y + 1 : y, nextM = m === 12 ? 1 : m + 1;
  return {
    end: new Date(`${period}-${String(last).padStart(2, "0")}T12:00:00+07:00`),
    /** Batas eksklusif: semua yang bertanggal sebelum ini masih masuk periode. */
    endExclusive: new Date(`${nextY}-${String(nextM).padStart(2, "0")}-01T00:00:00+07:00`),
    start: new Date(`${period}-01T00:00:00+07:00`),
    nextFirst: new Date(`${nextY}-${String(nextM).padStart(2, "0")}-01T12:00:00+07:00`),
    nextPeriod: `${nextY}-${String(nextM).padStart(2, "0")}`,
  };
}

/**
 * Apakah biaya ini sudah dijurnal sampai batas periode? Murni.
 * Vendor bill aktif bertanggal ≤ akhir bulan, voucher dibayar ≤ akhir bulan, atau biaya armada dicatat ≤ akhir bulan.
 */
export function journaledBy(
  line: { bill: { date: Date; status: string } | null; voucher: { status: string; paidAt: Date | null } | null; recordedAt: Date | null },
  endExclusive: Date,
): boolean {
  if (line.bill && line.bill.status !== "CANCELLED" && line.bill.date < endExclusive) return true;
  if (line.voucher?.status === "PAID" && line.voucher.paidAt && line.voucher.paidAt < endExclusive) return true;
  if (line.recordedAt && line.recordedAt < endExclusive) return true;
  return false;
}

export type AccrualCandidate = {
  lineId: string; jobId: string; jobNumber: string; customer: string; charge: string; chargeName: string;
  vendor: string | null; description: string | null; amount: number; accountId: string | null; accountCode: string; reason: string;
};

/** Bulan mulai akrual dari Setting Perusahaan ("YYYY-MM"), atau null bila akrual belum aktif. */
export async function getAccrualStart(db: Db): Promise<string | null> {
  const s = await db.companySetting.findFirst({ select: { accrualStartPeriod: true } });
  return s?.accrualStartPeriod ?? null;
}

/**
 * Biaya yang akan diakrualkan bila periode ini di-closing sekarang. `startPeriod`: hanya job yang ditagih pertama kali
 * mulai bulan itu (biaya lama sebelum akrual dipakai tidak ikut). Tanpa `startPeriod` semua job ditagih ikut.
 */
export async function accrualCandidates(db: Db, period: string, startPeriod: string | null = null): Promise<AccrualCandidate[]> {
  const { endExclusive } = periodBounds(period);
  const invoiced = { status: { not: "CANCELLED" as const }, date: { lt: endExclusive } };
  const before = startPeriod ? { status: { not: "CANCELLED" as const }, date: { lt: periodBounds(startPeriod).start } } : null;
  const lines = await db.costingLine.findMany({
    where: {
      side: "BUYING", asReceipt: false, actualIdr: { gt: 0 },
      job: {
        status: { not: "CANCELLED" }, OR: [{ invoices: { some: invoiced } }, { costings: { some: { invoice: invoiced } } }],
        ...(before ? { AND: [{ invoices: { none: before } }, { costings: { none: { invoice: before } } }] } : {}),
      },
    },
    include: {
      job: { select: { id: true, number: true, customer: { select: { name: true } } } },
      chargeCode: { select: { code: true, name: true, expenseAccountId: true, expenseAccount: { select: { code: true } } } },
      vendor: { select: { name: true } },
      vehicle: { select: { plate: true } },
      bill: { select: { date: true, status: true, number: true } },
      voucher: { select: { status: true, paidAt: true, number: true } },
    },
    orderBy: [{ job: { number: "asc" } }, { sortOrder: "asc" }],
  });
  return lines
    .filter((l) => !journaledBy(l, endExclusive))
    .map((l) => ({
      lineId: l.id, jobId: l.job.id, jobNumber: l.job.number, customer: l.job.customer.name,
      charge: l.chargeCode.code, chargeName: l.chargeCode.name,
      vendor: l.vendor?.name ?? (l.vehicle ? `Armada ${l.vehicle.plate}` : null), description: l.description,
      amount: r2(Number(l.actualIdr)), accountId: l.chargeCode.expenseAccountId, accountCode: l.chargeCode.expenseAccount?.code ?? ACC.EXP_OTHER,
      reason: l.bill && l.bill.status !== "CANCELLED" ? `Bill ${l.bill.number} bertanggal bulan berikutnya`
        : l.voucher && l.voucher.status !== "CANCELLED" ? `Voucher ${l.voucher.number} belum dibayar di bulan ini`
        : l.vehicleId ? "Biaya armada belum dicatat" : "Belum ada vendor bill atau voucher",
    }));
}

export type MissingCost = { jobId: string; jobNumber: string; customer: string; invoiceNumbers: string; missing: string[]; noCost: boolean };

/**
 * Daftar periksa sebelum closing: job yang ditagih di bulan ini tapi biayanya kelihatan belum lengkap.
 * Charge yang ada di selling dan biasanya punya biaya vendor (pernah muncul di buying job mana pun) tapi belum ada di
 * buying job ini, atau job tanpa biaya non-reimburse sama sekali. Hanya peringatan, tidak membuat jurnal.
 */
export async function possibleMissingCosts(db: Db, period: string): Promise<MissingCost[]> {
  const { start, endExclusive } = periodBounds(period);
  const [jobs, usedOnBuying] = await Promise.all([
    db.job.findMany({
      where: { status: { not: "CANCELLED" }, invoices: { some: { status: { not: "CANCELLED" }, date: { gte: start, lt: endExclusive } } } },
      select: {
        id: true, number: true, customer: { select: { name: true } },
        invoices: { where: { status: { not: "CANCELLED" }, date: { gte: start, lt: endExclusive } }, select: { number: true } },
        costings: { where: { asReceipt: false }, select: { side: true, chargeCodeId: true, chargeCode: { select: { code: true } } } },
      },
      orderBy: { number: "asc" },
    }),
    db.costingLine.findMany({ where: { side: "BUYING", asReceipt: false }, distinct: ["chargeCodeId"], select: { chargeCodeId: true } }),
  ]);
  const vendorCharges = new Set(usedOnBuying.map((c) => c.chargeCodeId));
  const out: MissingCost[] = [];
  for (const j of jobs) {
    const buying = new Set(j.costings.filter((c) => c.side === "BUYING").map((c) => c.chargeCodeId));
    const missing = [...new Set(j.costings
      .filter((c) => c.side === "SELLING" && vendorCharges.has(c.chargeCodeId) && !buying.has(c.chargeCodeId))
      .map((c) => c.chargeCode.code))];
    const noCost = buying.size === 0;
    if (missing.length || noCost) {
      out.push({ jobId: j.id, jobNumber: j.number, customer: j.customer.name, invoiceNumbers: j.invoices.map((i) => i.number).join(", "), missing, noCost });
    }
  }
  return out;
}

/** Jurnal akrual periode ini (bukan pembaliknya), bila sudah pernah dibuat. Pembalik memakai sourceId "YYYY-MM:REV". */
export function findAccrual(db: Db, period: string) {
  return db.journalEntry.findFirst({ where: { source: "ACCRUAL", sourceId: period }, select: { id: true, number: true } });
}

/**
 * Buat jurnal akrual akhir bulan beserta pembaliknya tanggal 1 bulan berikutnya. Dipanggil di dalam transaksi closing,
 * sebelum bulan dikunci. Tidak membuat apa pun bila tidak ada biaya atau akrual bulan ini sudah ada (closing ulang).
 */
export async function postMonthAccrual(tx: Tx, period: string, userId?: string): Promise<{ entryId: string; reversalId: string; total: number; count: number } | null> {
  const start = await getAccrualStart(tx);
  if (!start || period < start) return null;
  if (await findAccrual(tx, period)) return null;
  const items = await accrualCandidates(tx, period, start);
  if (!items.length) return null;
  const acc = await accountMap(tx);
  const credit = acc[ACCRUED_AP];
  if (!credit) throw new Error(`Akun ${ACCRUED_AP} Hutang Belum Ditagih belum ada di Chart of Accounts.`);
  const total = r2(items.reduce((s, i) => s + i.amount, 0));
  const { end, nextFirst } = periodBounds(period);
  const label = periodLabel(period);
  const entryId = await postJournal(tx, {
    date: end, source: "ACCRUAL", sourceId: period, createdById: userId,
    description: `Akrual biaya belum ditagih ${label} (${items.length} biaya)`,
    lines: [
      ...items.map((i) => ({
        accountId: i.accountId ?? acc[ACC.EXP_OTHER], debit: i.amount,
        description: `${i.jobNumber} ${i.charge}${i.vendor ? ` ${i.vendor}` : ""}`,
      })),
      { accountId: credit, credit: total, description: `Hutang belum ditagih ${label}` },
    ],
  });
  // Pembalik jurnal biasa (bukan pembatalan), supaya akrual tidak tampil sebagai transaksi batal di jurnal dan Buku Besar.
  const reversalId = await postJournal(tx, {
    date: nextFirst, source: "ACCRUAL", sourceId: `${period}:REV`, createdById: userId,
    description: `Pembalik akrual ${label} (awal ${periodLabel(periodBounds(period).nextPeriod)})`,
    lines: [
      { accountId: credit, debit: total, description: `Pembalik hutang belum ditagih ${label}` },
      ...items.map((i) => ({
        accountId: i.accountId ?? acc[ACC.EXP_OTHER], credit: i.amount,
        description: `${i.jobNumber} ${i.charge}${i.vendor ? ` ${i.vendor}` : ""}`,
      })),
    ],
  });
  await tx.accrualLine.createMany({
    data: items.map((i) => ({ period, entryId, costingLineId: i.lineId, amount: i.amount })),
  });
  return { entryId, reversalId, total, count: items.length };
}

export type AccrualReviewRow = { lineId: string | null; jobId: string | null; jobNumber: string; charge: string; vendor: string | null; amount: number; note: string };

/**
 * Pemeriksaan akrual periode yang sudah dibuat, untuk bulan yang dibuka koreksi. `doubles`: biaya yang ikut akrual
 * dan sekarang juga sudah dijurnal di bulan itu (vendor bill/voucher/armada bertanggal <= akhir bulan), jadi tercatat
 * dua kali. `missed`: biaya yang sekarang memenuhi syarat akrual tapi tidak ikut akrual (misalnya baru diinput).
 * Penyesuaiannya lewat Jurnal Umum (Dr 2050 / Cr beban untuk dobel, sebaliknya untuk yang terlewat).
 */
export async function accrualReview(db: Db, period: string) {
  const entry = await findAccrual(db, period);
  if (!entry) return null;
  const { endExclusive } = periodBounds(period);
  const accrued = await db.accrualLine.findMany({
    where: { entryId: entry.id },
    include: {
      costingLine: {
        include: {
          job: { select: { id: true, number: true } }, chargeCode: { select: { code: true } }, vendor: { select: { name: true } },
          bill: { select: { date: true, status: true, number: true } }, voucher: { select: { status: true, paidAt: true, number: true } },
        },
      },
    },
  });
  const accruedTotal = r2(accrued.reduce((s, a) => s + Number(a.amount), 0));
  const doubles: AccrualReviewRow[] = [];
  for (const a of accrued) {
    const l = a.costingLine;
    if (!l) {
      doubles.push({ lineId: null, jobId: null, jobNumber: "-", charge: "-", vendor: null, amount: r2(Number(a.amount)), note: "Baris biaya sudah dihapus dari Costing" });
      continue;
    }
    if (!journaledBy(l, endExclusive)) continue;
    const by = l.bill && l.bill.status !== "CANCELLED" && l.bill.date < endExclusive ? `bill ${l.bill.number}`
      : l.voucher?.status === "PAID" ? `voucher ${l.voucher.number}` : "biaya armada";
    doubles.push({
      lineId: l.id, jobId: l.job.id, jobNumber: l.job.number, charge: l.chargeCode.code, vendor: l.vendor?.name ?? null,
      amount: r2(Number(a.amount)), note: `Juga dicatat lewat ${by} di ${periodLabel(period)}`,
    });
  }
  const accruedIds = new Set(accrued.map((a) => a.costingLineId).filter(Boolean));
  const missed: AccrualReviewRow[] = (await accrualCandidates(db, period, await getAccrualStart(db)))
    .filter((c) => !accruedIds.has(c.lineId))
    .map((c) => ({ lineId: c.lineId, jobId: c.jobId, jobNumber: c.jobNumber, charge: c.charge, vendor: c.vendor, amount: c.amount, note: c.reason }));
  return { entryNumber: entry.number, accruedTotal, doubles, missed };
}

/** Periode akrual per baris biaya, untuk peringatan saat membuat bill bertanggal di bulan yang biayanya sudah diakrualkan. */
export async function accruedPeriodsByLine(db: Db, lineIds: string[]): Promise<Record<string, string[]>> {
  if (!lineIds.length) return {};
  const rows = await db.accrualLine.findMany({ where: { costingLineId: { in: lineIds } }, select: { costingLineId: true, period: true } });
  const out: Record<string, string[]> = {};
  for (const r of rows) if (r.costingLineId) (out[r.costingLineId] ??= []).push(r.period);
  return out;
}

/** Atur bulan mulai akrual ("YYYY-MM"), atau null untuk menonaktifkan. */
export async function setAccrualStart(db: PrismaClient, period: string | null): Promise<void> {
  if (period !== null && !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error("Pilih bulan mulai akrual.");
  const s = await db.companySetting.findFirst({ select: { id: true } });
  if (!s) throw new Error("Setting Perusahaan belum ada.");
  await db.companySetting.update({ where: { id: s.id }, data: { accrualStartPeriod: period } });
}
