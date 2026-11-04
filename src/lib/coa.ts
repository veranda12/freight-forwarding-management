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
  PPN_IN: "1400",
  FIXED_ASSET: "1600",
  ACC_DEP: "1650",
  DEP_EXPENSE: "6400",
  RETAINED: "3100",
  PPH26: "2250",
  PPH23: "2200",
  REV_OTHER: "4900",
  EXP_OTHER: "5900",
  EXP_ADMIN: "6300",
  EXP_BANK: "6350", // biaya admin bank dan biaya transfer
  EXP_OPS_OTHER: "6390", // potongan atau biaya lain saat penerimaan
  PPH23_CLAIM: "1450",
  FX: "7100",
} as const;
