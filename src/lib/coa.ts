import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

/** Peta kode akun → id. Kode standar yang dipakai posting otomatis. */
export async function accountMap(tx: Tx): Promise<Record<string, string>> {
  const accounts = await tx.coaAccount.findMany({ select: { id: true, code: true } });
  const map: Record<string, string> = {};
  for (const a of accounts) map[a.code] = a.id;
  return map;
}

export const ACC = {
  KAS: "1100",
  BANK: "1200",
  AR: "1300",
  WIP: "1500",
  AP: "2000",
  PPN_OUT: "2100",
  PPH23: "2200",
  REV_OTHER: "4900",
  EXP_OTHER: "5900",
  FX: "7100",
} as const;
