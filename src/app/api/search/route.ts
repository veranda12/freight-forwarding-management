import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json([], { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json([]);

  const like = { contains: q, mode: "insensitive" as const };

  const [jobs, customers, containers] = await Promise.all([
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
    ...containers.map((c) => ({
      type: "container" as const,
      label: c.containerNo,
      sublabel: `Job ${c.job.number}`,
      href: `/jobs/${c.job.id}`,
    })),
  ];

  return NextResponse.json(results);
}
