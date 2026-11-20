-- Bulan mulai akrual (kosong = belum aktif), supaya biaya lama sebelum fitur dipakai tidak menumpuk di closing pertama.
ALTER TABLE "CompanySetting" ADD COLUMN IF NOT EXISTS "accrualStartPeriod" TEXT;

-- Baris biaya yang ikut jurnal akrual, untuk memeriksa biaya tercatat dua kali saat bulan dibuka untuk koreksi.
CREATE TABLE IF NOT EXISTS "AccrualLine" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "costingLineId" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    CONSTRAINT "AccrualLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AccrualLine_period_idx" ON "AccrualLine"("period");
CREATE INDEX IF NOT EXISTS "AccrualLine_costingLineId_idx" ON "AccrualLine"("costingLineId");
ALTER TABLE "AccrualLine" ADD CONSTRAINT "AccrualLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccrualLine" ADD CONSTRAINT "AccrualLine_costingLineId_fkey" FOREIGN KEY ("costingLineId") REFERENCES "CostingLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
