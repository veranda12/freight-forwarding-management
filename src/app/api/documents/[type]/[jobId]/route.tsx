import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { JobDocument, type PdfJob, type PdfCompany } from "@/lib/pdf/job-document";

export const runtime = "nodejs";

const VALID = new Set(["hbl", "mbl", "hawb", "mawb", "si", "arrival", "do"]);

export async function GET(_req: NextRequest, ctx: { params: Promise<{ type: string; jobId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { type, jobId } = await ctx.params;
  const kind = type.toLowerCase();
  if (!VALID.has(kind)) return NextResponse.json({ error: "invalid document type" }, { status: 400 });

  const [job, company] = await Promise.all([
    prisma.job.findUnique({
      where: { id: jobId },
      include: {
        pol: true, pod: true, originAirport: true, destAirport: true,
        containers: { include: { containerType: true } },
      },
    }),
    prisma.companySetting.findFirst(),
  ]);
  if (!job) return NextResponse.json({ error: "job not found" }, { status: 404 });

  const pdfJob: PdfJob = {
    number: job.number, mode: job.mode,
    mblNo: job.mblNo, hblNo: job.hblNo, mawbNo: job.mawbNo, hawbNo: job.hawbNo,
    shipperName: job.shipperName, shipperAddress: job.shipperAddress,
    consigneeName: job.consigneeName, consigneeAddress: job.consigneeAddress,
    notifyName: job.notifyName, notifyAddress: job.notifyAddress,
    vesselName: job.vesselName, voyageNo: job.voyageNo, flightNo: job.flightNo,
    etd: job.etd, eta: job.eta, incoterm: job.incoterm, goodsDescription: job.goodsDescription,
    grossWeightKg: job.grossWeightKg, volumeCbm: job.volumeCbm, chargeableWeight: job.chargeableWeight,
    packages: job.packages, packageType: job.packageType,
    originName: job.pol?.name ?? job.originAirport?.name ?? "-",
    destName: job.pod?.name ?? job.destAirport?.name ?? "-",
    containers: job.containers.map((c) => ({ containerNo: c.containerNo, sealNo: c.sealNo, type: c.containerType?.code ?? null })),
  };

  const pdfCompany: PdfCompany = company
    ? { name: company.name, address: company.address, city: company.city, phone: company.phone, email: company.email, npwp: company.npwp }
    : { name: "PT Samudra Lintas Logistik", address: null, city: null, phone: null, email: null, npwp: null };

  const buffer = await renderToBuffer(<JobDocument kind={kind} job={pdfJob} company={pdfCompany} />);

  return new NextResponse(buffer as any, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${kind.toUpperCase()}-${job.number.replace(/\//g, "-")}.pdf"`,
    },
  });
}
