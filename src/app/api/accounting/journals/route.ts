import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { parseJournalFilter, SOURCE_LABEL } from "@/lib/journal-filter";
import { searchJournals } from "@/lib/journal-search";

export const runtime = "nodejs";

const csvCell = (v: string | number | null) => {
  const s = v === null ? "" : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !can((session.user as any).role, "accounting", "read")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const filter = parseJournalFilter(req.nextUrl.searchParams);
  const asCsv = req.nextUrl.searchParams.get("format") === "csv";
  const result = await searchJournals(prisma, filter, { all: asCsv });

  if (!asCsv) return NextResponse.json(result);

  const header = ["No. Jurnal", "Tanggal", "Sumber", "Keterangan Jurnal", "Kode Akun", "Nama Akun", "Keterangan Baris", "Debit", "Kredit"];
  const lines = [header.join(",")];
  for (const r of result.rows) {
    for (const l of r.lines) {
      lines.push([
        r.number, r.date.slice(0, 10), SOURCE_LABEL[r.source] ?? r.source, r.description,
        l.code, l.name, l.description, l.debit, l.credit,
      ].map(csvCell).join(","));
    }
  }
  return new NextResponse("﻿" + lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="jurnal-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
