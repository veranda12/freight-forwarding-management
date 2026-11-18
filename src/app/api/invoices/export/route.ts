import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, hasPerm } from "@/lib/auth-helpers";
import { invoiceScope } from "@/lib/data-scope";
import { logger } from "@/lib/logger";
import { jktKey } from "@/lib/accounting-core";
import { buildInvoiceWorkbook, ExportTooLargeError, loadInvoiceExport, XLSX_TYPE } from "@/lib/doc-export";
import { parseInvoiceExportFilter } from "@/lib/doc-export-filter";

export const runtime = "nodejs";

/** Export Excel invoice: `?from=YYYY-MM-DD&to=YYYY-MM-DD&status=`. Izin sama dengan membuka daftar Invoice. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sesi berakhir, silakan login ulang." }, { status: 401 });
  if (!hasPerm(user, "invoices.view")) return NextResponse.json({ error: "Tidak punya izin melihat invoice." }, { status: 403 });

  const parsed = parseInvoiceExportFilter(Object.fromEntries(req.nextUrl.searchParams), jktKey(new Date()));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const f = parsed.filter;

  try {
    const docs = await loadInvoiceExport(prisma, f, undefined, invoiceScope(user));
    const buffer = await buildInvoiceWorkbook(docs).xlsx.writeBuffer();
    return new NextResponse(new Uint8Array(buffer as ArrayBuffer), {
      headers: {
        "Content-Type": XLSX_TYPE,
        "Content-Disposition": `attachment; filename="invoice_${f.from}_sd_${f.to}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof ExportTooLargeError) return NextResponse.json({ error: e.message }, { status: 400 });
    void logger.error("Export Excel invoice gagal", { error: e });
    return NextResponse.json({ error: "Gagal membuat file Excel." }, { status: 500 });
  }
}
