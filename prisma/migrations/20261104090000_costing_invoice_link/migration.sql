-- Hubungkan baris selling ke invoice yang menagihnya, agar satu baris tidak ditagih dua kali
-- dan pembatalan invoice hanya membuka kembali baris milik invoice tersebut.
ALTER TABLE "CostingLine" ADD COLUMN "invoiceId" TEXT;
CREATE INDEX "CostingLine_invoiceId_idx" ON "CostingLine"("invoiceId");
ALTER TABLE "CostingLine" ADD CONSTRAINT "CostingLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Data lama: jika job hanya punya satu invoice aktif, baris selling yang sudah ditagih dihubungkan ke invoice itu.
-- Job dengan lebih dari satu invoice aktif dibiarkan tanpa tautan, karena pasangannya tidak bisa dipastikan.
UPDATE "CostingLine" c
SET "invoiceId" = x."invoiceId"
FROM (
  SELECT i."jobId", MIN(i."id") AS "invoiceId"
  FROM "Invoice" i
  WHERE i."jobId" IS NOT NULL AND i."status" <> 'CANCELLED'
  GROUP BY i."jobId"
  HAVING COUNT(*) = 1
) x
WHERE c."jobId" = x."jobId" AND c."side" = 'SELLING' AND c."invoiced" = true AND c."invoiceId" IS NULL;
