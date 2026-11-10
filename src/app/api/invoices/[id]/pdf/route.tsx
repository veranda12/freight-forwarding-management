import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { groupContainers } from "@/lib/rate-card";
import { InvoiceDocument, type PdfExcludedLine, type PdfInvoice, type PdfInvoiceCompany } from "@/lib/pdf/invoice-document";

export const runtime = "nodejs";

const LANE_EN = { GREEN: "Green lane", YELLOW: "Yellow lane", RED: "Red lane" } as const;

/** Cetak invoice: halaman ringkas lalu halaman detail, dalam satu PDF. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can((session.user as { role?: any }).role, "invoices", "read")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await ctx.params;

  const [inv, company] = await Promise.all([
    prisma.invoice.findUnique({
      where: { id },
      include: {
        customer: true,
        lines: { include: { chargeCode: true, job: { select: { id: true, number: true, hblNo: true, mblNo: true, hawbNo: true, mawbNo: true } } }, orderBy: { sortOrder: "asc" } },
        job: { include: { pol: true, pod: true, originAirport: true, destAirport: true, containers: { include: { containerType: true }, orderBy: { containerNo: "asc" } } } },
      },
    }),
    prisma.companySetting.findFirst(),
  ]);
  if (!inv) return NextResponse.json({ error: "invoice not found" }, { status: 404 });

  const job = inv.job;
  const groups = job ? groupContainers(job.containers) : [];
  let excluded: PdfExcludedLine[] = [];
  // Biaya khusus jalur merah dicetak sebagai "Excluded" bila job bukan jalur merah, seperti contoh invoice clearance.
  if (job?.customsLane && job.customsLane !== "RED" && inv.lines.some((l) => l.section === "LOCAL")) {
    const red = await prisma.rateCardItem.findMany({
      where: { isActive: true, condition: "RED_LANE", OR: [{ customerId: null }, { customerId: inv.customerId }] },
      include: { chargeCode: true }, orderBy: { sortOrder: "asc" },
    });
    const seen = new Set<string>();
    // Tarifnya tidak dicetak (permintaan client), cukup nama biaya dan keterangan "Excluded".
    excluded = red.filter((r) => !seen.has(r.chargeCodeId) && seen.add(r.chargeCodeId)).map((r) => ({
      section: r.chargeCode.invoiceSection, name: r.chargeCode.name,
      unitLabel: groups.length === 1 ? groups[0].code : groups.length > 1 ? "Per cont." : null,
      reason: `Red lane only. Not applicable: ${LANE_EN[job.customsLane!]}.`,
    }));
  }

  // Invoice gabungan: semua job dan B/L dicetak, dan tiap baris menyebut B/L asalnya.
  const jobs = [...new Map(inv.lines.flatMap((l) => (l.job ? [[l.job.id, l.job] as const] : []))).values()];
  const multi = jobs.length > 1;
  const blOf = (j: (typeof jobs)[number]) => j.hblNo ?? j.mblNo ?? j.hawbNo ?? j.mawbNo ?? j.number;

  const pdfInv: PdfInvoice = {
    ppnRate: Number(inv.ppnRate),
    number: inv.number, date: inv.date, dueDate: inv.dueDate,
    termDays: Math.max(0, Math.round((inv.dueDate.getTime() - inv.date.getTime()) / 86400000)),
    currency: inv.currency, exchangeRate: Number(inv.exchangeRate), amountForeign: Number(inv.amountForeign),
    subtotal: Number(inv.subtotal), ppn: Number(inv.ppnAmount), total: Number(inv.total), status: inv.status,
    customer: { name: inv.customer.name, address: inv.customer.address, city: inv.customer.city, country: inv.customer.country, npwp: inv.customer.npwp },
    shipment: job ? {
      jobNumber: multi ? jobs.map((j) => j.number).join(", ") : job.number,
      blNo: multi ? jobs.map(blOf).join(", ") : job.hblNo ?? job.mblNo ?? job.hawbNo ?? job.mawbNo,
      vessel: multi ? null : [job.vesselName, job.voyageNo].filter(Boolean).join(" / ") || job.flightNo,
      route: [job.pol?.name ?? job.originAirport?.name, job.pod?.name ?? job.destAirport?.name].filter(Boolean).join(" to ") || null,
      containers: !multi && groups.length ? groups.map((g) => `${g.count} x ${g.code}`).join(", ") : null,
      lane: !multi && job.customsLane ? LANE_EN[job.customsLane] : null,
      containerNos: multi ? null : job.containers.map((c) => c.containerNo).join(", ") || null,
    } : null,
    lines: inv.lines.map((l) => ({
      section: l.section ?? l.chargeCode.invoiceSection, name: l.description ?? l.chargeCode.name, note: multi && l.job ? [`B/L ${blOf(l.job)}`, l.note].filter(Boolean).join(" · ") : l.note,
      qty: Number(l.qty), unitLabel: l.unitLabel, unitPrice: Number(l.unitPrice), amount: Number(l.amount), asReceipt: l.asReceipt,
    })),
    excluded: multi ? [] : excluded,
  };

  const logo = company?.logoPath ? path.join(process.cwd(), "public", company.logoPath.replace(/^\/+/, "")) : null;
  const pdfCompany: PdfInvoiceCompany = {
    name: company?.name ?? "PT Samudra Lintas Logistik",
    address: company?.address ?? null, city: company?.city ?? null, phone: company?.phone ?? null, email: company?.email ?? null, npwp: company?.npwp ?? null,
    bankName: company?.bankName ?? null, bankAccount: company?.bankAccount ?? null, bankHolder: company?.bankHolder ?? null, bankBranch: company?.bankBranch ?? null,
    signatoryName: company?.signatoryName ?? null, signatoryTitle: company?.signatoryTitle ?? null,
    // Data URI, karena react-pdf membaca path Windows (D:\...) sebagai URL dan logonya tidak tampil.
    logoFile: logo && fs.existsSync(logo) ? `data:image/${logo.endsWith(".png") ? "png" : "jpeg"};base64,${fs.readFileSync(logo).toString("base64")}` : null,
  };

  const buffer = await renderToBuffer(<InvoiceDocument inv={pdfInv} company={pdfCompany} />);
  return new NextResponse(buffer as any, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${inv.number.replace(/\//g, "-")}.pdf"`,
    },
  });
}
