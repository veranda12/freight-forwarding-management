import type { TradeDirection } from "@prisma/client";

/** Job beserta container-nya, bahan laporan Container per Bulan. */
export type ContainerJob = {
  id: string; number: string; customer: string; direction: TradeDirection;
  etd: Date | null; atd: Date | null; eta: Date | null; ata: Date | null; openedAt: Date;
  containers: { containerNo: string | null; type: { code: string; teu: number } | null }[];
};

export type ContainerMonth = {
  month: string; // YYYY-MM
  jobs: (ContainerJob & { date: Date })[];
  byType: Record<string, number>;
  containers: number;
  teu: number;
};

export const NO_TYPE = "Tanpa tipe";

/**
 * Tanggal yang menentukan bulan job: impor memakai tanggal tiba (ATA, kalau belum ada ETA), ekspor memakai
 * tanggal berangkat (ATD, kalau belum ada ETD). Tanpa jadwal kapal, pakai tanggal job dibuka.
 */
export function containerDate(j: Pick<ContainerJob, "direction" | "etd" | "atd" | "eta" | "ata" | "openedAt">): Date {
  return (j.direction === "EXPORT" ? j.atd ?? j.etd : j.ata ?? j.eta) ?? j.openedAt;
}

/** Bulan kalender WIB (YYYY-MM). */
export function monthKeyJakarta(d: Date): string {
  return new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 7);
}

/** Rekap container per bulan untuk satu tahun: 12 baris (Jan sampai Des), tipe container yang muncul, dan totalnya. */
export function containerReport(jobs: ContainerJob[], year: number) {
  const months: ContainerMonth[] = Array.from({ length: 12 }, (_, i) => ({
    month: `${year}-${String(i + 1).padStart(2, "0")}`, jobs: [], byType: {}, containers: 0, teu: 0,
  }));
  const types = new Set<string>();
  for (const j of jobs) {
    if (j.containers.length === 0) continue;
    const date = containerDate(j);
    const m = months.find((x) => x.month === monthKeyJakarta(date));
    if (!m) continue;
    m.jobs.push({ ...j, date });
    for (const c of j.containers) {
      const code = c.type?.code ?? NO_TYPE;
      types.add(code);
      m.byType[code] = (m.byType[code] ?? 0) + 1;
      m.containers++;
      m.teu += c.type?.teu ?? 0;
    }
  }
  for (const m of months) m.jobs.sort((a, b) => a.date.getTime() - b.date.getTime());
  const total = { jobs: 0, byType: {} as Record<string, number>, containers: 0, teu: 0 };
  for (const m of months) {
    total.jobs += m.jobs.length; total.containers += m.containers; total.teu += m.teu;
    for (const [k, v] of Object.entries(m.byType)) total.byType[k] = (total.byType[k] ?? 0) + v;
  }
  // Tipe diurutkan menurut kode (20GP, 40GP, 40HC, ...), "Tanpa tipe" paling akhir.
  const typeList = [...types].sort((a, b) => (a === NO_TYPE ? 1 : b === NO_TYPE ? -1 : a.localeCompare(b)));
  return { year, types: typeList, months, total };
}

/** Bentuk query Prisma untuk bahan laporan: job tidak batal yang punya container. */
export const containerJobSelect = {
  id: true, number: true, direction: true, etd: true, atd: true, eta: true, ata: true, openedAt: true,
  customer: { select: { name: true } },
  containers: { select: { containerNo: true, containerType: { select: { code: true, teu: true } } } },
} as const;

export function toContainerJob(j: {
  id: string; number: string; direction: TradeDirection; etd: Date | null; atd: Date | null; eta: Date | null; ata: Date | null; openedAt: Date;
  customer: { name: string }; containers: { containerNo: string | null; containerType: { code: string; teu: unknown } | null }[];
}): ContainerJob {
  return {
    ...j, customer: j.customer.name,
    containers: j.containers.map((c) => ({ containerNo: c.containerNo, type: c.containerType ? { code: c.containerType.code, teu: Number(c.containerType.teu) } : null })),
  };
}
