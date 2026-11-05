import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import type { Role } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json([], { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json([]);

  // Tanpa `mode: "insensitive"`: collation MariaDB (utf8mb4_unicode_ci) sudah tidak membedakan huruf besar/kecil.
  const like = { contains: q };
  const canDomestic = can((session.user as { role?: Role }).role, "domestic", "read");

  const [jobs, customers, containers, stts] = await Promise.all([
    prisma.job.findMany({
      where: {
        OR: [
          { number: like }, { mblNo: like }, { hblNo: like }, { mawbNo: like }, { hawbNo: like },
          { shipperName: like }, { consigneeName: like },
        ],
      },
      select: { id: true, number: true, status: true, customer: { select: { name: true } } },
      take: 6,
    }),
    prisma.customer.findMany({
      where: { OR: [{ name: like }, { code: like }] },
      select: { id: true, name: true, code: true, city: true },
      take: 5,
    }),
    prisma.jobContainer.findMany({
      where: { containerNo: like },
      select: { containerNo: true, job: { select: { id: true, number: true } } },
      take: 5,
    }),
    canDomestic
      ? prisma.domesticShipment.findMany({
          where: { OR: [{ number: like }, { consigneeName: like }, { shipperName: like }, { destCity: like }] },
          select: { id: true, number: true, originCity: true, destCity: true, customer: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          take: 5,
        })
      : Promise.resolve([]),
  ]);

  const results = [
    ...jobs.map((j) => ({
      type: "job" as const,
      label: j.number,
      sublabel: `${j.customer.name} · ${j.status}`,
      href: `/jobs/${j.id}`,
    })),
    ...customers.map((c) => ({
      type: "customer" as const,
      label: c.name,
      sublabel: `${c.code} · ${c.city ?? "-"}`,
      href: `/customers/${c.id}`,
    })),
    ...stts.map((t) => ({
      type: "stt" as const,
      label: t.number,
      sublabel: `Domestik · ${t.originCity} → ${t.destCity} · ${t.customer.name}`,
      href: `/domestic/${t.id}`,
    })),
    ...containers.map((c) => ({
      type: "container" as const,
      label: c.containerNo,
      sublabel: `Job ${c.job.number}`,
      href: `/jobs/${c.job.id}`,
    })),
  ];

  return NextResponse.json(results);
}
