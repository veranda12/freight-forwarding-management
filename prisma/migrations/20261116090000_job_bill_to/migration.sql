-- Job: pihak yang ditagih (SHIPPER/CONSIGNEE). Job lama dibiarkan kosong.
ALTER TABLE "Job" ADD COLUMN "billTo" TEXT;

-- Selaraskan PeriodClosing.updatedAt dengan schema (@updatedAt tanpa default database).
ALTER TABLE "PeriodClosing" ALTER COLUMN "updatedAt" DROP DEFAULT;
