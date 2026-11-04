/** Tampilkan status setoran pajak per masa (hanya membaca, aman untuk demo). */
import { PrismaClient } from "@prisma/client";
import { getTaxPeriods } from "../../src/lib/tax";
import { STATUS_LABEL } from "../../src/lib/tax-period";

const db = new PrismaClient();
(async () => {
  const legacy = await db.journalEntry.count({ where: { source: "MANUAL", description: { startsWith: "Setor " } } });
  console.log("jurnal setor cara lama (MANUAL):", legacy);
  const { rows } = await getTaxPeriods(db, 2026, "2026-10");
  for (const r of rows) {
    const c = (k: "PPN" | "PPH23" | "PPH26") => `${k} ${STATUS_LABEL[r.cells[k].status]} sisa ${Math.round(r.cells[k].payable).toLocaleString("id-ID")}`;
    if (["PPN", "PPH23", "PPH26"].some((k) => r.cells[k as "PPN"].status !== "NONE")) console.log(r.label.padEnd(16), c("PPN"), "|", c("PPH23"), "|", c("PPH26"));
  }
})().finally(() => db.$disconnect());
