import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { formatInTimeZone } from "date-fns-tz";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { TZ } from "@/lib/format";
import { JOB_STATUS_LABELS } from "@/lib/enums";
import { blOf, invoiceNumbersOf, jobListWhere, parseJobListFilter } from "@/lib/job-list";

export const runtime = "nodejs";

const day = (d: Date | null) => (d ? formatInTimeZone(d, TZ, "dd/MM/yyyy") : "-");

/** Export daftar job ke Excel dengan filter yang sama seperti halaman Job (default: dibuat hari ini). */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !can((session.user as any).role, "jobs", "read")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const sp = req.nextUrl.searchParams;
  const filter = parseJobListFilter({ by: sp.get("by") ?? undefined, q: sp.get("q") ?? undefined, from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined });

  const jobs = await prisma.job.findMany({
    where: jobListWhere(filter),
    orderBy: { openedAt: "desc" },
    select: {
      number: true, status: true, openedAt: true, etd: true, eta: true,
      vesselName: true, voyageNo: true, flightNo: true, shipperName: true, consigneeName: true,
      hblNo: true, mblNo: true, hawbNo: true, mawbNo: true,
      invoices: { select: { number: true, status: true }, orderBy: { number: "asc" } },
    },
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = "CargoFlow";
  wb.created = new Date();
  const ws = wb.addWorksheet("Job");
  ws.columns = [
    { header: "No. Job", key: "number", width: 26 },
    { header: "B/L", key: "bl", width: 22 },
    { header: "Tgl", key: "date", width: 12 },
    { header: "Shipper", key: "shipper", width: 32 },
    { header: "Consignee", key: "consignee", width: 32 },
    { header: "Vessel", key: "vessel", width: 26 },
    { header: "ETD", key: "etd", width: 12 },
    { header: "ETA", key: "eta", width: 12 },
    { header: "Invoice", key: "invoice", width: 26 },
    { header: "Status", key: "status", width: 14 },
  ];
  for (const j of jobs) {
    ws.addRow({
      number: j.number,
      bl: blOf(j) || "-",
      date: day(j.openedAt),
      shipper: j.shipperName || "-",
      consignee: j.consigneeName || "-",
      vessel: j.flightNo || [j.vesselName, j.voyageNo].filter(Boolean).join(" ") || "-",
      etd: day(j.etd),
      eta: day(j.eta),
      invoice: invoiceNumbersOf(j.invoices) || "-",
      status: JOB_STATUS_LABELS[j.status],
    });
  }
  const header = ws.getRow(1);
  header.font = { bold: true };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
  header.height = 20;
  ws.views = [{ state: "frozen", ySplit: 1 }];

  const name = "q" in filter
    ? `job-${filter.by}-${filter.q.replace(/[^A-Za-z0-9-]+/g, "_")}`
    : filter.from === filter.to ? `job-${filter.from}` : `job-${filter.from}_${filter.to}`;
  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as any, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}.xlsx"`,
    },
  });
}
