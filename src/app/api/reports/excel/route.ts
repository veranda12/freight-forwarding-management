import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getArAging, getApAging } from "@/lib/accounting";
import { MODE_LABELS } from "@/lib/enums";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const type = req.nextUrl.searchParams.get("type") ?? "profitability";
  const wb = new ExcelJS.Workbook();
  wb.creator = "CargoFlow";
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
      where: { status: { not: "CANCELLED" } },
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
    const data = type === "ar-aging" ? await getArAging() : await getApAging();
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
