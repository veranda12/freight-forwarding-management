-- AlterTable
ALTER TABLE "BillLine" ADD COLUMN "jobId" TEXT;

-- CreateIndex
CREATE INDEX "BillLine_jobId_idx" ON "BillLine"("jobId");

-- AddForeignKey
ALTER TABLE "BillLine" ADD CONSTRAINT "BillLine_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Bill lama: baris mengikuti job bill-nya.
UPDATE "BillLine" l SET "jobId" = b."jobId" FROM "VendorBill" b WHERE l."billId" = b."id" AND b."jobId" IS NOT NULL;
