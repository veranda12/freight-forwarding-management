import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { can } from "@/lib/rbac";
import { logger } from "@/lib/logger";
import { jktKey } from "@/lib/accounting-core";
import { parseBillFilter } from "@/lib/bill-groups";
import { buildBillWorkbook, ExportTooLargeError, loadBillExport, XLSX_TYPE } from "@/lib/doc-export";

export const runtime = "nodejs";

/**
 * Export Excel Vendor Bill dengan filter yang sama seperti halaman /bills (query string-nya), tanpa batas halaman.
 * Bill lintas job diekspor utuh beserta semua barisnya.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sesi berakhir, silakan login ulang." }, { status: 401 });
  if (!can(user.role, "bills", "read")) return NextResponse.json({ error: "Tidak punya izin melihat vendor bill." }, { status: 403 });

  const today = jktKey(new Date());
  const f = parseBillFilter(Object.fromEntries(req.nextUrl.searchParams));
  try {
    const docs = await loadBillExport(prisma, f, today);
    const buffer = await buildBillWorkbook(docs).xlsx.writeBuffer();
    return new NextResponse(new Uint8Array(buffer as ArrayBuffer), {
      headers: {
        "Content-Type": XLSX_TYPE,
        "Content-Disposition": `attachment; filename="bill_${today}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof ExportTooLargeError) return NextResponse.json({ error: e.message }, { status: 400 });
    void logger.error("Export Excel vendor bill gagal", { error: e });
    return NextResponse.json({ error: "Gagal membuat file Excel." }, { status: 500 });
  }
}
