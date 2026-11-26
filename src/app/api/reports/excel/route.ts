import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getCurrentUser, hasPerm } from "@/lib/auth-helpers";
import { billScope, invoiceScope, jobScope } from "@/lib/data-scope";
import { prisma } from "@/lib/prisma";
import { getArAging, getApAging } from "@/lib/accounting";
import { MODE_LABELS } from "@/lib/enums";
import { PRODUCT } from "@/config/product";
import { containerJobSelect, containerReport, toContainerJob } from "@/lib/container-report";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const type = req.nextUrl.searchParams.get("type") ?? "profitability";
  // Export butuh izin export laporan + izin lihat modul sumber datanya; isinya mengikuti batas data user.
  const sourcePerm = type === "ar-aging" ? "invoices.view" : type === "ap-aging" ? "bills.view" : "jobs.view";
  if (!hasPerm(user, "reports.export") || !hasPerm(user, sourcePerm)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const wb = new ExcelJS.Workbook();
  wb.creator = PRODUCT.name;
  wb.created = new Date();

  const money = '#,##0';

  if (type === "profitability") {
    const ws = wb.addWorksheet("Job Profitability");
    ws.columns = [
      { header: "No. Job", key: "number", width: 26 },
      { header: "Mode", key: "mode", width: 18 },
      { header: "Customer", key: "customer", width: 32 },
      { header: "Revenue", key: "rev", width: 16, style: { numFmt: money } },
      { header: "Cost", key: "cost", width: 16, style: { numFmt: money } },
      { header: "Profit", key: "profit", width: 16, style: { numFmt: money } },
      { header: "Margin %", key: "margin", width: 12, style: { numFmt: "0.0" } },
    ];
    const jobs = await prisma.job.findMany({
      where: { ...jobScope(user), status: { not: "CANCELLED" } },
      orderBy: { openedAt: "desc" },
      include: { customer: { select: { name: true } } },
    });
    for (const j of jobs) {
      ws.addRow({
        number: j.number, mode: MODE_LABELS[j.mode], customer: j.customer.name,
        rev: Number(j.revenueIdr), cost: Number(j.costIdr), profit: Number(j.profitIdr), margin: Number(j.marginPct),
      });
    }
    styleHeader(ws);
  } else if (type === "ar-aging" || type === "ap-aging") {
    const data = type === "ar-aging" ? await getArAging(invoiceScope(user)) : await getApAging(billScope(user));
    const ws = wb.addWorksheet(type === "ar-aging" ? "AR Aging" : "AP Aging");
    ws.columns = [
      { header: type === "ar-aging" ? "Customer" : "Vendor", key: "name", width: 34 },
      { header: "0-30", key: "b1", width: 16, style: { numFmt: money } },
      { header: "31-60", key: "b2", width: 16, style: { numFmt: money } },
      { header: "61-90", key: "b3", width: 16, style: { numFmt: money } },
      { header: ">90", key: "b4", width: 16, style: { numFmt: money } },
      { header: "Total", key: "total", width: 18, style: { numFmt: money } },
    ];
    for (const r of data.rows) {
      ws.addRow({ name: r.name, b1: r.buckets["0-30"], b2: r.buckets["31-60"], b3: r.buckets["61-90"], b4: r.buckets[">90"], total: r.total });
    }
    ws.addRow({ name: "TOTAL", b1: data.totals["0-30"], b2: data.totals["31-60"], b3: data.totals["61-90"], b4: data.totals[">90"], total: data.grandTotal });
    styleHeader(ws);
    ws.lastRow!.font = { bold: true };

    // Rincian dokumen yang membentuk angka aging: invoice belum dibayar customer / bill belum dibayar ke vendor.
    const ar = type === "ar-aging";
    const wd = wb.addWorksheet("Rincian");
    wd.columns = [
      { header: ar ? "Customer" : "Vendor", key: "party", width: 32 },
      { header: ar ? "No. Invoice" : "No. Bill", key: "number", width: 22 },
      ...(ar ? [] : [{ header: "Ref Vendor", key: "ref", width: 22 }]),
      { header: "Job / B/L", key: "jobs", width: 40 },
      { header: "Tanggal", key: "date", width: 13, style: { numFmt: "dd/mm/yyyy" } },
      { header: "Jatuh Tempo", key: "due", width: 13, style: { numFmt: "dd/mm/yyyy" } },
      { header: "Lewat (hari)", key: "days", width: 12 },
      { header: "Umur", key: "bucket", width: 10 },
      { header: "Total", key: "total", width: 16, style: { numFmt: money } },
      { header: "Dibayar", key: "paid", width: 16, style: { numFmt: money } },
      { header: "Sisa", key: "outstanding", width: 16, style: { numFmt: money } },
    ];
    for (const r of data.rows) {
      for (const d of r.docs) {
        wd.addRow({
          party: r.name, number: d.number, ref: d.ref ?? "", jobs: d.jobs, date: new Date(d.date), due: new Date(d.dueDate),
          days: d.days, bucket: `${d.bucket} hari`, total: d.total, paid: d.paid, outstanding: d.outstanding,
        });
      }
    }
    styleHeader(wd);
  } else if (type === "containers") {
    const year = Number(req.nextUrl.searchParams.get("year")) || new Date(Date.now() + 7 * 3600_000).getUTCFullYear();
    const jobs = await prisma.job.findMany({
      where: { ...jobScope(user), status: { not: "CANCELLED" }, containers: { some: {} } },
      select: containerJobSelect,
    });
    const data = containerReport(jobs.map(toContainerJob), year);
    const ws = wb.addWorksheet(`Container ${year}`);
    ws.columns = [
      { header: "Bulan", key: "month", width: 12 },
      { header: "Jml Job", key: "jobs", width: 10 },
      ...data.types.map((t) => ({ header: t, key: `t:${t}`, width: 10 })),
      { header: "Total Container", key: "containers", width: 16 },
      { header: "TEU", key: "teu", width: 10, style: { numFmt: "0.##" } },
    ];
    for (const m of data.months) {
      ws.addRow({ month: m.month, jobs: m.jobs.length, containers: m.containers, teu: m.teu, ...Object.fromEntries(data.types.map((t) => [`t:${t}`, m.byType[t] ?? 0])) });
    }
    const tr = ws.addRow({ month: "Total", jobs: data.total.jobs, containers: data.total.containers, teu: data.total.teu, ...Object.fromEntries(data.types.map((t) => [`t:${t}`, data.total.byType[t] ?? 0])) });
    tr.font = { bold: true };
    styleHeader(ws);

    const wd = wb.addWorksheet("Rincian");
    wd.columns = [
      { header: "Bulan", key: "month", width: 10 },
      { header: "No. Job", key: "number", width: 26 },
      { header: "Customer", key: "customer", width: 32 },
      { header: "Arah", key: "dir", width: 8 },
      { header: "Tanggal", key: "date", width: 12, style: { numFmt: "dd/mm/yyyy" } },
      { header: "No. Container", key: "no", width: 16 },
      { header: "Tipe", key: "code", width: 8 },
      { header: "TEU", key: "teu", width: 6 },
    ];
    for (const m of data.months) for (const j of m.jobs) for (const c of j.containers) {
      wd.addRow({ month: m.month, number: j.number, customer: j.customer, dir: j.direction === "EXPORT" ? "Ekspor" : "Impor", date: new Date(j.date.getTime() + 7 * 3600_000), // Excel membaca tanggal apa adanya, geser ke WIB
        no: c.containerNo, code: c.type?.code ?? "-", teu: c.type?.teu ?? 0 });
    }
    styleHeader(wd);
  } else {
    return NextResponse.json({ error: "unknown report" }, { status: 400 });
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as any, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${type}-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}

function styleHeader(ws: ExcelJS.Worksheet) {
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B4A8F" } };
  header.alignment = { vertical: "middle" };
  header.height = 20;
}
