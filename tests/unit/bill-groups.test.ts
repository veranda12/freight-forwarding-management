import { describe, it, expect } from "vitest";
import {
  allocate, billOutstanding, groupBillsByJob, jobMatches, NO_JOB, parseBillFilter, splitBillByJob,
  type BillInput, type JobInfo,
} from "@/lib/bill-groups";

const job = (id: string, customerId = "c1", bls: string[] = []): JobInfo => ({ id, number: `JOB/${id}`, customerId, customer: `Cust ${customerId}`, bls });
const A = job("A", "c1", ["MBL-A"]);
const B = job("B", "c2", ["HBL-B"]);

let seq = 0;
function bill(p: Partial<BillInput> & { lines: BillInput["lines"] }): BillInput {
  seq++;
  const subtotal = p.lines.reduce((s, l) => s + l.amount, 0);
  return {
    id: `b${seq}`, number: `BILL/${String(seq).padStart(3, "0")}`, vendorRef: null, vendor: "Vendor",
    date: "2026-11-01T05:00:00.000Z", dueDate: "2026-11-20T05:00:00.000Z", currency: "IDR", status: "UNPAID",
    subtotal, total: subtotal, amountPaid: 0, amountForeign: 0, amountPaidForeign: 0, exchangeRate: 1, headerJob: null,
    ...p,
  };
}
const ln = (amount: number, j: JobInfo | null, id = `l${++seq}`) => ({ id, charge: "HANDLING", description: "Handling", amount, job: j });
const TODAY = "2026-11-10";
const NOF = { job: "", bl: "", customerId: "" };

describe("allocate — pembagian sen tepat", () => {
  it("jumlah bagian selalu sama dengan nilai asal", () => {
    for (const [amt, w] of [[100, [1, 1, 1]], [1_250_000.5, [100_000_025, 25_000_025]], [0.01, [1, 1]], [999_999.99, [3, 7, 11]]] as const) {
      const r = allocate(amt, [...w]);
      expect(Math.round(r.reduce((s, x) => s + x, 0) * 100)).toBe(Math.round(amt * 100));
    }
  });
  it("100 dibagi tiga: sisa sen ke bobot pertama", () => {
    expect(allocate(100, [1, 1, 1])).toEqual([33.34, 33.33, 33.33]);
  });
  it("bobot nol semua → seluruhnya ke bagian pertama", () => {
    expect(allocate(50, [0, 0])).toEqual([50, 0]);
  });
});

describe("splitBillByJob", () => {
  it("bill lintas job: PPN/PPh dan pembayaran terbagi proporsional, jumlah persis", () => {
    const b = bill({ lines: [ln(1_000_000, A), ln(500_000, B)], total: 1_516_500, amountPaid: 500_000, status: "PARTIAL" });
    const s = splitBillByJob(b);
    expect(s.map((x) => x.key)).toEqual(["A", "B"]);
    expect(s[0].portion.total + s[1].portion.total).toBe(1_516_500);
    expect(s[0].portion.paid + s[1].portion.paid).toBe(500_000);
    expect(s[0].portion.total).toBe(1_011_000);
    expect(s[0].portion.outstanding + s[1].portion.outstanding).toBe(1_016_500);
    expect(s[0].portion.bill.jobCount).toBe(2);
    expect(s[0].portion.lines).toHaveLength(1);
  });
  it("baris tanpa job ikut job kepala bill (data lama)", () => {
    const s = splitBillByJob(bill({ headerJob: A, lines: [ln(100, null), ln(200, null)] }));
    expect(s).toHaveLength(1);
    expect(s[0].key).toBe("A");
    expect(s[0].portion.total).toBe(300);
  });
  it("tanpa job sama sekali → kelompok Tanpa job", () => {
    expect(splitBillByJob(bill({ lines: [ln(100, null)] }))[0].key).toBe(NO_JOB);
  });
  it("bill tanpa baris → seluruh nilai ke job kepala", () => {
    const s = splitBillByJob(bill({ headerJob: B, lines: [], total: 700, subtotal: 700 }));
    expect(s[0].key).toBe("B");
    expect(s[0].portion.total).toBe(700);
  });
  it("bill batal tidak punya sisa", () => {
    const b = bill({ lines: [ln(100, A)], status: "CANCELLED" });
    expect(billOutstanding(b)).toBe(0);
    expect(splitBillByJob(b)[0].portion.outstanding).toBe(0);
  });
});

describe("groupBillsByJob", () => {
  const cross = bill({ lines: [ln(600, A), ln(400, B)] });
  const onlyA = bill({ lines: [ln(250, A)], dueDate: "2026-11-05T05:00:00.000Z" });
  const paidB = bill({ lines: [ln(300, B)], amountPaid: 300, status: "PAID" });
  const loose = bill({ lines: [ln(50, null)] });

  it("total keseluruhan = jumlah bill, tanpa hitung ganda bill lintas job", () => {
    const { groups, totals } = groupBillsByJob([cross, onlyA, paidB, loose], NOF, TODAY);
    expect(totals.billCount).toBe(4);
    expect(totals.total).toBe(1000 + 250 + 300 + 50);
    expect(totals.outstanding).toBe(1000 + 250 + 50);
    expect(groups.reduce((s, g) => s + g.total, 0)).toBe(totals.total);
    const a = groups.find((g) => g.key === "A")!;
    expect(a.total).toBe(850);
    expect(a.billCount).toBe(2);
  });
  it("urutan: job yang masih ada sisa & paling dekat jatuh tempo dulu, Tanpa job terakhir", () => {
    const { groups } = groupBillsByJob([cross, onlyA, paidB, loose], NOF, TODAY);
    expect(groups.map((g) => g.key)).toEqual(["A", "B", NO_JOB]);
    expect(groups[0].nearestDue).toBe(onlyA.dueDate);
    expect(groups[0].overdueDays).toBe(5);
    expect(groups[1].overdueDays).toBe(0);
  });
  it("status ringkas per job", () => {
    const { groups } = groupBillsByJob([paidB], NOF, TODAY);
    expect(groups[0].status).toBe("PAID");
    expect(groups[0].nearestDue).toBeNull();
  });
  it("lewat jatuh tempo dihitung per bill", () => {
    const { totals } = groupBillsByJob([cross, onlyA], NOF, TODAY);
    expect(totals.overdueOutstanding).toBe(250);
  });
  it("filter job: bill lintas job hanya muncul porsi job yang cocok", () => {
    const { groups, totals } = groupBillsByJob([cross, onlyA, loose], { ...NOF, bl: "hbl-b" }, TODAY);
    expect(groups.map((g) => g.key)).toEqual(["B"]);
    expect(totals.total).toBe(400);
    expect(totals.billCount).toBe(1);
  });
});

describe("jobMatches & parseBillFilter", () => {
  it("cocokkan no. job, B/L, customer; Tanpa job gugur bila filter job aktif", () => {
    expect(jobMatches(A, { job: "job/a", bl: "", customerId: "" })).toBe(true);
    expect(jobMatches(A, { job: "", bl: "mbl", customerId: "c2" })).toBe(false);
    expect(jobMatches(null, { job: "", bl: "", customerId: "c1" })).toBe(false);
    expect(jobMatches(null, NOF)).toBe(true);
  });
  it("bawaan status = belum lunas, nilai tak sah diabaikan", () => {
    const f = parseBillFilter({ status: "x", due: "overdue", from: "2026-13", to: "2026-11-30", currency: "usd", page: "-2", job: [" JOB/1 ", "x"] });
    expect(f).toMatchObject({ status: "open", due: "overdue", from: "", to: "2026-11-30", currency: "USD", page: 1, job: "JOB/1" });
  });
});
