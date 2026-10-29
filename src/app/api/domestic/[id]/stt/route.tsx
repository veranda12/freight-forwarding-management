import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import type { Role } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { DOM_MODE_LABELS } from "@/lib/enums";
import { SttDocument } from "@/lib/pdf/stt-document";
import type { PdfCompany } from "@/lib/pdf/job-document";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can((session.user as { role?: Role }).role, "domestic", "read")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const [stt, company] = await Promise.all([
    prisma.domesticShipment.findUnique({
      where: { id },
      include: { customer: { select: { name: true } }, packages: { orderBy: { sortOrder: "asc" } } },
    }),
    prisma.companySetting.findFirst(),
  ]);
  if (!stt) return NextResponse.json({ error: "STT not found" }, { status: 404 });

  const pdfCompany: PdfCompany = company
    ? { name: company.name, address: company.address, city: company.city, phone: company.phone, email: company.email, npwp: company.npwp }
    : { name: "PT Samudra Lintas Logistik", address: null, city: null, phone: null, email: null, npwp: null };

  const buffer = await renderToBuffer(
    <SttDocument
      modeLabel={DOM_MODE_LABELS[stt.mode]}
      company={pdfCompany}
      stt={{
        number: stt.number, mode: stt.mode, createdAt: stt.createdAt, pickupDate: stt.pickupDate, etaDate: stt.etaDate,
        originCity: stt.originCity, destCity: stt.destCity,
        shipperName: stt.shipperName, shipperPhone: stt.shipperPhone, shipperAddress: stt.shipperAddress,
        consigneeName: stt.consigneeName, consigneePhone: stt.consigneePhone, consigneeAddress: stt.consigneeAddress,
        goodsDescription: stt.goodsDescription, customerName: stt.customer.name,
        totalKoli: stt.totalKoli, actualWeightKg: Number(stt.actualWeightKg), volumeCbm: Number(stt.volumeCbm),
        volumetricWeightKg: Number(stt.volumetricWeightKg), chargeableWeightKg: Number(stt.chargeableWeightKg), divisor: stt.divisor,
        packages: stt.packages.map((p) => ({
          qty: p.qty, lengthCm: Number(p.lengthCm), widthCm: Number(p.widthCm), heightCm: Number(p.heightCm),
          weightKg: Number(p.weightKg), description: p.description,
        })),
        notes: stt.notes,
      }}
    />,
  );

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${stt.number.replace(/\//g, "-")}.pdf"`,
    },
  });
}
