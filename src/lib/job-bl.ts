import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export type BlNumbers = { air: boolean; master: string | null; house: string | null };
type OtherJob = { number: string; master: string | null; house: string | null };

const same = (a: string | null, b: string | null) => !!a && !!b && a.trim().toUpperCase() === b.trim().toUpperCase();

/**
 * Alasan nomor B/L (atau AWB) tidak boleh dipakai, atau null bila boleh. Murni.
 * - House B/L / HAWB tidak boleh sama dengan job lain.
 * - Master B/L / MAWB boleh dipakai beberapa job (konsolidasi, tiap job punya house sendiri),
 *   tapi ditolak bila salah satu job tidak punya house, karena berarti shipment yang sama diinput dua kali.
 */
export function blConflict(input: BlNumbers, others: OtherJob[]): string | null {
  const [m, h] = input.air ? ["MAWB", "HAWB"] : ["Master B/L", "House B/L"];
  const dupHouse = others.find((o) => same(o.house, input.house));
  if (dupHouse) return `${h} ${input.house!.trim().toUpperCase()} sudah dipakai job ${dupHouse.number}.`;
  const dupMaster = others.find((o) => same(o.master, input.master) && (!o.house || !input.house));
  if (dupMaster) return `${m} ${input.master!.trim().toUpperCase()} sudah dipakai job ${dupMaster.number}. Satu ${m} hanya boleh dipakai beberapa job bila tiap job punya ${h} sendiri.`;
  return null;
}

/** Melempar error bila nomor B/L/AWB bentrok dengan job lain yang tidak dibatalkan. */
export async function assertBlUnique(db: Db, input: BlNumbers, excludeJobId?: string): Promise<void> {
  if (!input.master && !input.house) return;
  const ci = (v: string) => ({ equals: v.trim(), mode: "insensitive" as const });
  const [mKey, hKey] = input.air ? (["mawbNo", "hawbNo"] as const) : (["mblNo", "hblNo"] as const);
  const or: Prisma.JobWhereInput[] = [];
  if (input.master) or.push({ [mKey]: ci(input.master) });
  if (input.house) or.push({ [hKey]: ci(input.house) });
  const rows = await db.job.findMany({
    where: { status: { not: "CANCELLED" }, ...(excludeJobId ? { id: { not: excludeJobId } } : {}), OR: or },
    select: { number: true, mblNo: true, hblNo: true, mawbNo: true, hawbNo: true },
  });
  const others = rows.map((r) => ({ number: r.number, master: input.air ? r.mawbNo : r.mblNo, house: input.air ? r.hawbNo : r.hblNo }));
  const reason = blConflict(input, others);
  if (reason) throw new Error(reason);
}
