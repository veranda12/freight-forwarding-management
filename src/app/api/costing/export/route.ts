import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { formatInTimeZone } from "date-fns-tz";
import type { Role } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { TZ } from "@/lib/format";
import { MODE_SHORT } from "@/lib/enums";
import { exportName, parseListFilter } from "@/lib/list-filter";
import { COSTING_KEYS, costingBl, costingWhere } from "@/lib/costing-list";

export const runtime = "nodejs";

const day = (d: Date | null) => (d ? formatInTimeZone(d, TZ, "dd/MM/yyyy") : "-");
const IDR = "#,##0";

function styleHeader(ws: ExcelJS.Worksheet) {
  const header = ws.getRow(1);
  header.font = { bold: true };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
  header.height = 20;
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

/**
 * Export Costing dengan filter yang sama seperti halaman (default: job dibuat hari ini).
 * Sheet "Ringkasan" per job, sheet "Detail" per baris selling/buying.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !can((session.user as { role?: Role }).role, "costing", "read")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const sp = req.nextUrl.searchParams;
  const filter = parseListFilter({ by: sp.get("by") ?? undefined, q: sp.get("q") ?? undefined, from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined }, COSTING_KEYS);

  const jobs = await prisma.job.findMany({
    where: costingWhere(filter),
    orderBy: { openedAt: "desc" },
    include: {
      customer: { select: { name: true } },
      costings: {
        orderBy: [{ side: "desc" }, { sortOrder: "asc" }],
        include: {
          chargeCode: { select: { code: true, name: true } }, vendor: { select: { name: true } }, vehicle: { select: { plate: true } },
          invoice: { select: { number: true } }, bill: { select: { number: true } }, voucher: { select: { number: true } },
        },
      },
    },
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = "CargoFlow";
  wb.created = new Date();

  const sum = wb.addWorksheet("Ringkasan");
  sum.columns = [
    { header: "No. Job", key: "number", width: 26 },
    { header: "B/L", key: "bl", width: 26 },
    { header: "Tgl", key: "date", width: 12 },
    { header: "Customer", key: "customer", width: 32 },
    { header: "Mode", key: "mode", width: 10 },
    { header: "Revenue (IDR)", key: "revenue", width: 16, style: { numFmt: IDR } },
    { header: "Cost (IDR)", key: "cost", width: 16, style: { numFmt: IDR } },
    { header: "Profit (IDR)", key: "profit", width: 16, style: { numFmt: IDR } },
    { header: "Margin (%)", key: "margin", width: 11, style: { numFmt: "0.0" } },
  ];
  for (const j of jobs) {
    sum.addRow({
      number: j.number, bl: costingBl(j) || "-", date: day(j.openedAt), customer: j.customer.name, mode: MODE_SHORT[j.mode],
      revenue: Number(j.revenueIdr), cost: Number(j.costIdr), profit: Number(j.profitIdr), margin: Number(j.marginPct),
    });
  }
  if (jobs.length) {
    const total = (k: "revenueIdr" | "costIdr" | "profitIdr") => jobs.reduce((s, j) => s + Number(j[k]), 0);
    const t = sum.addRow({ number: "TOTAL", revenue: total("revenueIdr"), cost: total("costIdr"), profit: total("profitIdr") });
    t.font = { bold: true };
  }
  styleHeader(sum);

  const det = wb.addWorksheet("Detail");
  det.columns = [
    { header: "No. Job", key: "job", width: 26 },
    { header: "Sisi", key: "side", width: 9 },
    { header: "Charge", key: "charge", width: 30 },
    { header: "Vendor / Armada", key: "vendor", width: 28 },
    { header: "Qty", key: "qty", width: 7 },
    { header: "Mata uang", key: "currency", width: 9 },
    { header: "Harga", key: "price", width: 14, style: { numFmt: "#,##0.00" } },
    { header: "Kurs", key: "rate", width: 10, style: { numFmt: "#,##0.00" } },
    { header: "Nilai (IDR)", key: "idr", width: 16, style: { numFmt: IDR } },
    { header: "PPN (IDR)", key: "ppn", width: 14, style: { numFmt: IDR } },
    { header: "Reimburse", key: "reimburse", width: 10 },
    { header: "Status", key: "status", width: 26 },
  ];
  for (const j of jobs) {
    for (const l of j.costings) {
      const status = l.side === "SELLING"
        ? (l.invoice ? `Ditagih ${l.invoice.number}` : l.invoiced ? "Ditagih" : "Belum ditagih")
        : l.bill ? `Bill ${l.bill.number}` : l.billed ? "Di-bill" : l.voucher ? `Voucher ${l.voucher.number}` : l.recordedAt ? "Dicatat" : "Belum dibayar";
      det.addRow({
        job: j.number, side: l.side === "SELLING" ? "Selling" : "Buying",
        charge: `${l.chargeCode.code} ${l.chargeCode.name}${l.description && l.description !== l.chargeCode.code ? ` (${l.description})` : ""}`,
        vendor: l.vendor?.name ?? (l.vehicle ? `Armada ${l.vehicle.plate}` : "-"),
        qty: Number(l.qty), currency: l.currency, price: Number(l.unitPrice), rate: Number(l.exchangeRate),
        idr: Number(l.actualIdr), ppn: Number(l.ppnIdr),
        reimburse: l.asReceipt ? "Ya" : "-", status,
      });
    }
  }
  styleHeader(det);

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${exportName("costing", filter)}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
