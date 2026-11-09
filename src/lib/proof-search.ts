import type { Prisma, PrismaClient, Role } from "@prisma/client";
import { can, type Resource } from "./rbac";
import { BILL_STATUS_LABELS, INV_STATUS_LABELS, NOTE_STATUS_LABELS } from "./enums";
import { SOURCE_LABEL } from "./journal-filter";

type Db = PrismaClient | Prisma.TransactionClient;

// ---------------------------------------------------------------- bagian murni

export const PROOF_KINDS = ["journal", "invoice", "bill", "payment", "voucher", "note", "tax"] as const;
export type ProofKind = (typeof PROOF_KINDS)[number];

export const PROOF_KIND_LABEL: Record<ProofKind, string> = {
  journal: "Jurnal & bukti kas/bank",
  invoice: "Invoice (AR)",
  bill: "Vendor Bill (AP)",
  payment: "Receipt & Payment",
  voucher: "Voucher",
  note: "Debit/Credit Note",
  tax: "Setoran Pajak",
};

/** Modul pemilik tiap jenis bukti. Jenis hanya dicari bila user boleh membaca modulnya. */
export const PROOF_KIND_RESOURCE: Record<ProofKind, Resource> = {
  journal: "accounting",
  invoice: "invoices",
  bill: "bills",
  payment: "payments",
  voucher: "vouchers",
  note: "notes",
  tax: "accounting",
};

export function proofKindsFor(role: Role | null | undefined): ProofKind[] {
  return PROOF_KINDS.filter((k) => can(role, PROOF_KIND_RESOURCE[k], "read"));
}

const GROUPED = /^\d{1,3}(?:[.,]\d{3})+$/;

/**
 * Nominal dari ketikan user, format Indonesia diutamakan: "1.250.000", "1250000", "Rp 1.250.000",
 * "1.250.000,50". Format Inggris "1,250,000.50" juga diterima. Bukan nominal → null.
 */
export function parseIdAmount(raw: string): number | null {
  const s = raw.replace(/^\s*(rp\.?|idr)\s*/i, "").replace(/\s+/g, "");
  if (!/^\d[\d.,]*$/.test(s) || /[.,]$/.test(s)) return null;
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  let intPart = s;
  let frac = "";
  if (lastDot >= 0 && lastComma >= 0) {
    // pemisah terakhir = desimal, yang lain = ribuan dan harus berkelompok 3 digit
    const dec = Math.max(lastDot, lastComma);
    intPart = s.slice(0, dec);
    frac = s.slice(dec + 1);
    if (intPart.includes(s[dec]) || !GROUPED.test(intPart)) return null;
  } else {
    const sep = lastComma >= 0 ? "," : lastDot >= 0 ? "." : "";
    if (sep) {
      const parts = s.split(sep);
      const tail = parts[parts.length - 1];
      if (parts.length === 2 && tail.length <= 2) {
        // satu pemisah diikuti 1-2 digit = desimal ("12,5", "1.25")
        intPart = parts[0];
        frac = tail;
      } else if (!GROUPED.test(s)) {
        return null;
      }
    }
  }
  // "001" itu potongan nomor dokumen, bukan nominal
  if (frac.length > 2 || /^0\d/.test(intPart)) return null;
  const n = Number(`${intPart.replace(/[.,]/g, "")}.${frac || "0"}`);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

export type ProofQuery = { text: string; terms: string[]; amount: number | null };

export const PROOF_MIN_QUERY = 2;

/** Kata kunci → kata-kata (semua harus cocok) dan nominal bila kata kunci berupa angka. */
export function parseProofQuery(raw: string | null | undefined): ProofQuery | null {
  const text = (raw ?? "").trim().replace(/\s+/g, " ").slice(0, 100);
  if (text.length < PROOF_MIN_QUERY) return null;
  return { text, terms: text.split(" ").slice(0, 6), amount: parseIdAmount(text) };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Kata kunci, periode tanggal (YYYY-MM-DD, zona Jakarta), dan jenis bukti. Semuanya opsional. */
export type ProofFilter = { query: ProofQuery | null; from: string | null; to: string | null; kind: ProofKind | null };

/**
 * Filter dari query string. Bisa kata kunci saja, periode saja, atau keduanya.
 * Tanpa kata kunci dan tanpa periode → null (belum ada yang dicari). Tanggal terbalik ditukar.
 */
export function parseProofFilter(sp: { q?: string; from?: string; to?: string; kind?: string }): ProofFilter | null {
  const query = parseProofQuery(sp.q);
  let from = sp.from && ISO_DATE.test(sp.from) ? sp.from : null;
  let to = sp.to && ISO_DATE.test(sp.to) ? sp.to : null;
  if (from && to && from > to) [from, to] = [to, from];
  const kind = (PROOF_KINDS as readonly string[]).includes(sp.kind ?? "") ? (sp.kind as ProofKind) : null;
  if (!query && !from && !to) return null;
  return { query, from, to, kind };
}

// ---------------------------------------------------------------- pencarian

export type ProofHit = {
  kind: ProofKind;
  id: string;
  number: string;
  proofNumber: string | null;
  date: string;
  party: string;
  jobs: string;
  bls: string;
  amount: number;
  currency: string;
  status: string;
  description: string;
  journalEntryId: string | null;
  /** Halaman induk (voucher: job) bila jenis itu tidak punya halaman detail. */
  parentId: string | null;
};

export type ProofResult = { kind: ProofKind; hits: ProofHit[]; truncated: boolean };

/** Satu-satunya tempat pencocokan teks tanpa beda huruf besar/kecil (titik porting MariaDB). */
const ci = (t: string) => ({ contains: t, mode: "insensitive" as const });

type JobRef = { number: string; hblNo: string | null; mblNo: string | null; hawbNo: string | null; mawbNo: string | null } | null;
const JOB_SELECT = { number: true, hblNo: true, mblNo: true, hawbNo: true, mawbNo: true } as const;

const jobWhere = (t: string): Prisma.JobWhereInput => ({
  OR: [{ number: ci(t) }, { hblNo: ci(t) }, { mblNo: ci(t) }, { hawbNo: ci(t) }, { mawbNo: ci(t) }, { customer: { name: ci(t) } }],
});

export type DateRange = { from?: string | null; to?: string | null };

const startOf = (d: string) => new Date(`${d}T00:00:00+07:00`);
const endOf = (d: string) => new Date(`${d}T23:59:59.999+07:00`);

/**
 * Setiap kata harus cocok di salah satu kolom; atau nominalnya sama persis.
 * Ditambah batas tanggal bila periode diisi. Tanpa kata kunci, hanya periode yang membatasi.
 */
function build<W>(q: ProofQuery | null, range: DateRange, fields: (t: string) => W[], amount: (n: number) => W[]): { AND: W[] } {
  const and: W[] = [];
  if (q) {
    const text = { AND: q.terms.map((t) => ({ OR: fields(t) })) } as W;
    and.push(q.amount === null ? text : ({ OR: [text, ...amount(q.amount)] } as W));
  }
  if (range.from || range.to) {
    and.push({ date: { ...(range.from ? { gte: startOf(range.from) } : {}), ...(range.to ? { lte: endOf(range.to) } : {}) } } as W);
  }
  return { AND: and };
}

function jobsText(refs: JobRef[]) {
  const m = new Map<string, NonNullable<JobRef>>();
  for (const j of refs) if (j) m.set(j.number, j);
  const list = [...m.values()];
  return {
    jobs: list.map((j) => j.number).join(", "),
    bls: [...new Set(list.flatMap((j) => [j.hblNo, j.mblNo, j.hawbNo, j.mawbNo]).filter(Boolean))].join(", "),
  };
}

const VOUCHER_STATUS: Record<string, string> = { ISSUED: "Diterbitkan", PAID: "Dibayar", CANCELLED: "Dibatalkan" };
const n = (v: unknown) => Number(v ?? 0);

async function searchKind(db: Db, kind: ProofKind, q: ProofQuery | null, range: DateRange, take: number): Promise<ProofHit[]> {
  switch (kind) {
    case "journal": {
      const rows = await db.journalEntry.findMany({
        where: build<Prisma.JournalEntryWhereInput>(
          q, range,
          (t) => [{ number: ci(t) }, { description: ci(t) }, { lines: { some: { description: ci(t) } } }],
          (a) => [{ lines: { some: { OR: [{ debit: a }, { credit: a }] } } }],
        ),
        orderBy: [{ date: "desc" }, { number: "desc" }],
        take,
        select: { id: true, number: true, date: true, description: true, source: true, isReversed: true, isReversal: true, lines: { select: { debit: true } } },
      });
      return rows.map((e) => ({
        kind, id: e.id, number: e.number, proofNumber: null, date: e.date.toISOString(), party: "", jobs: "", bls: "",
        amount: Math.round(e.lines.reduce((s, l) => s + n(l.debit), 0) * 100) / 100, currency: "IDR",
        status: e.isReversal ? "Pembalik" : e.isReversed ? "Dibatalkan" : SOURCE_LABEL[e.source] ?? e.source,
        description: e.description, journalEntryId: e.id, parentId: null,
      }));
    }
    case "invoice": {
      const rows = await db.invoice.findMany({
        where: build<Prisma.InvoiceWhereInput>(
          q, range,
          (t) => [{ number: ci(t) }, { notes: ci(t) }, { customer: { name: ci(t) } }, { job: jobWhere(t) }, { lines: { some: { job: jobWhere(t) } } }],
          (a) => [{ total: a }, { subtotal: a }, { amountForeign: a }],
        ),
        orderBy: [{ date: "desc" }, { number: "desc" }],
        take,
        select: {
          id: true, number: true, date: true, total: true, status: true, notes: true, journalEntryId: true,
          customer: { select: { name: true } }, job: { select: JOB_SELECT }, lines: { select: { job: { select: JOB_SELECT } } },
        },
      });
      return rows.map((i) => ({
        kind, id: i.id, number: i.number, proofNumber: null, date: i.date.toISOString(), party: i.customer.name,
        ...jobsText([...i.lines.map((l) => l.job), i.job]),
        amount: n(i.total), currency: "IDR", status: INV_STATUS_LABELS[i.status], description: i.notes ?? "",
        journalEntryId: i.journalEntryId, parentId: null,
      }));
    }
    case "bill": {
      const rows = await db.vendorBill.findMany({
        where: build<Prisma.VendorBillWhereInput>(
          q, range,
          (t) => [
            { number: ci(t) }, { vendorRef: ci(t) }, { notes: ci(t) }, { vendor: { name: ci(t) } },
            { job: jobWhere(t) }, { lines: { some: { OR: [{ description: ci(t) }, { job: jobWhere(t) }] } } },
          ],
          (a) => [{ total: a }, { subtotal: a }, { amountForeign: a }],
        ),
        orderBy: [{ date: "desc" }, { number: "desc" }],
        take,
        select: {
          id: true, number: true, vendorRef: true, date: true, total: true, status: true, notes: true, journalEntryId: true,
          vendor: { select: { name: true } }, job: { select: JOB_SELECT }, lines: { select: { job: { select: JOB_SELECT } } },
        },
      });
      return rows.map((b) => ({
        kind, id: b.id, number: b.number, proofNumber: b.vendorRef, date: b.date.toISOString(), party: b.vendor.name,
        ...jobsText([...b.lines.map((l) => l.job), b.job]),
        amount: n(b.total), currency: "IDR", status: BILL_STATUS_LABELS[b.status], description: b.notes ?? "",
        journalEntryId: b.journalEntryId, parentId: null,
      }));
    }
    case "payment": {
      const rows = await db.payment.findMany({
        where: build<Prisma.PaymentWhereInput>(
          q, range,
          (t) => [
            { number: ci(t) }, { reference: ci(t) }, { notes: ci(t) }, { customer: { name: ci(t) } }, { vendor: { name: ci(t) } },
            { allocations: { some: { OR: [
              { invoice: { OR: [{ number: ci(t) }, { job: jobWhere(t) }] } },
              { bill: { OR: [{ number: ci(t) }, { vendorRef: ci(t) }, { job: jobWhere(t) }] } },
            ] } } },
          ],
          (a) => [{ amount: a }],
        ),
        orderBy: [{ date: "desc" }, { number: "desc" }],
        take,
        select: {
          id: true, number: true, direction: true, date: true, amount: true, reference: true, notes: true, journalEntryId: true,
          customer: { select: { name: true } }, vendor: { select: { name: true } },
          allocations: { select: { invoice: { select: { number: true, job: { select: JOB_SELECT } } }, bill: { select: { number: true, job: { select: JOB_SELECT } } } } },
        },
      });
      return rows.map((p) => {
        const docs = p.allocations.flatMap((a) => [a.invoice?.number, a.bill?.number]).filter(Boolean);
        return {
          kind, id: p.id, number: p.number, proofNumber: p.reference, date: p.date.toISOString(),
          party: p.customer?.name ?? p.vendor?.name ?? "-",
          ...jobsText(p.allocations.flatMap((a) => [a.invoice?.job ?? null, a.bill?.job ?? null])),
          amount: n(p.amount), currency: "IDR", status: p.direction === "RECEIPT" ? "Penerimaan" : "Pembayaran",
          description: [docs.join(", "), p.notes].filter(Boolean).join(" · "), journalEntryId: p.journalEntryId, parentId: null,
        };
      });
    }
    case "voucher": {
      const rows = await db.voucher.findMany({
        where: build<Prisma.VoucherWhereInput>(
          q, range,
          (t) => [
            { number: ci(t) }, { proofNumber: ci(t) }, { payee: ci(t) }, { notes: ci(t) }, { reference: ci(t) },
            { vendor: { name: ci(t) } }, { job: jobWhere(t) }, { invoice: { number: ci(t) } }, { bill: { number: ci(t) } },
          ],
          (a) => [{ total: a }],
        ),
        orderBy: [{ date: "desc" }, { number: "desc" }],
        take,
        select: {
          id: true, number: true, proofNumber: true, date: true, payee: true, total: true, status: true, notes: true, journalEntryId: true, jobId: true,
          job: { select: JOB_SELECT }, invoice: { select: { number: true } }, bill: { select: { number: true } },
        },
      });
      return rows.map((v) => ({
        kind, id: v.id, number: v.number, proofNumber: v.proofNumber, date: v.date.toISOString(), party: v.payee,
        ...jobsText([v.job]), amount: n(v.total), currency: "IDR", status: VOUCHER_STATUS[v.status] ?? v.status,
        description: [v.invoice ? `Invoice ${v.invoice.number}` : v.bill ? `Bill ${v.bill.number}` : "", v.notes].filter(Boolean).join(" · "),
        journalEntryId: v.journalEntryId, parentId: v.jobId,
      }));
    }
    case "note": {
      const rows = await db.note.findMany({
        where: build<Prisma.NoteWhereInput>(
          q, range,
          (t) => [{ number: ci(t) }, { description: ci(t) }, { agent: { name: ci(t) } }],
          (a) => [{ amountIdr: a }, { amountForeign: a }],
        ),
        orderBy: [{ date: "desc" }, { number: "desc" }],
        take,
        select: { id: true, number: true, kind: true, date: true, amountIdr: true, status: true, description: true, journalEntryId: true, agent: { select: { name: true } } },
      });
      return rows.map((x) => ({
        kind, id: x.id, number: x.number, proofNumber: null, date: x.date.toISOString(), party: x.agent?.name ?? "-",
        jobs: "", bls: "", amount: n(x.amountIdr), currency: "IDR",
        status: `${x.kind === "DEBIT" ? "Debit" : "Credit"} · ${NOTE_STATUS_LABELS[x.status]}`,
        description: x.description ?? "", journalEntryId: x.journalEntryId, parentId: null,
      }));
    }
    case "tax": {
      const rows = await db.taxRemittance.findMany({
        where: build<Prisma.TaxRemittanceWhereInput>(q, range, (t) => [{ ntpn: ci(t) }, { period: ci(t) }], (a) => [{ amount: a }]),
        orderBy: [{ date: "desc" }],
        take,
        select: { id: true, kind: true, period: true, date: true, amount: true, ntpn: true, status: true, journalEntryId: true },
      });
      return rows.map((x) => ({
        kind, id: x.id, number: x.ntpn ? `NTPN ${x.ntpn}` : `${x.kind} ${x.period}`, proofNumber: null,
        date: x.date.toISOString(), party: "Kas negara", jobs: "", bls: "", amount: n(x.amount), currency: "IDR",
        status: x.status === "CANCELLED" ? "Dibatalkan" : "Disetor", description: `Setor ${x.kind} masa ${x.period}`,
        journalEntryId: x.journalEntryId, parentId: null,
      }));
    }
  }
}

/**
 * Cari bukti di semua jenis yang diizinkan. Tiap jenis maksimal `limit` hasil, `truncated` bila lebih.
 * `q` boleh null bila periode diisi: semua bukti di periode itu, terbaru dulu.
 */
export async function searchProofs(
  db: Db, q: ProofQuery | null, kinds: readonly ProofKind[], opts: { limit?: number } & DateRange = {},
): Promise<ProofResult[]> {
  const limit = opts.limit ?? 20;
  const range = { from: opts.from, to: opts.to };
  return Promise.all(
    kinds.map(async (kind) => {
      const hits = await searchKind(db, kind, q, range, limit + 1);
      return { kind, hits: hits.slice(0, limit), truncated: hits.length > limit };
    }),
  );
}

// ---------------------------------------------------------------- alur jurnal

export type ProofJournalLine = { code: string; name: string; description: string | null; debit: number; credit: number };
export type ProofJournal = { id: string; number: string; date: string; description: string; isReversal: boolean; lines: ProofJournalLine[] };

const LINE_SELECT = {
  select: { description: true, debit: true, credit: true, account: { select: { code: true, name: true } } },
  orderBy: [{ debit: "desc" }, { id: "asc" }],
} satisfies Prisma.JournalEntry$linesArgs;
const ENTRY_SELECT = { id: true, number: true, date: true, description: true, isReversal: true, lines: LINE_SELECT } satisfies Prisma.JournalEntrySelect;
type EntryRow = Prisma.JournalEntryGetPayload<{ select: typeof ENTRY_SELECT }>;

const toJournal = (e: EntryRow): ProofJournal => ({
  id: e.id, number: e.number, date: e.date.toISOString(), description: e.description, isReversal: e.isReversal,
  lines: e.lines.map((l) => ({ code: l.account.code, name: l.account.name, description: l.description, debit: n(l.debit), credit: n(l.credit) })),
});

/**
 * Jurnal di balik tiap bukti, ditambah jurnal pembaliknya bila bukti itu dibatalkan.
 * Dikelompokkan per id jurnal asal; satu query untuk semua hasil pencarian.
 */
export async function proofJournals(db: Db, ids: readonly string[]): Promise<Record<string, ProofJournal[]>> {
  const unique = [...new Set(ids)];
  if (!unique.length) return {};
  const rows = await db.journalEntry.findMany({
    where: { id: { in: unique } },
    select: { ...ENTRY_SELECT, reversedBy: { select: ENTRY_SELECT } },
  });
  return Object.fromEntries(rows.map((e) => [e.id, [toJournal(e), ...(e.reversedBy ? [toJournal(e.reversedBy)] : [])]]));
}
