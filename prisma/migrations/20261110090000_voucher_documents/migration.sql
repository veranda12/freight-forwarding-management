-- Voucher dari invoice / vendor bill: jenis voucher, tautan dokumen dan pembayarannya, dan baris dokumen yang dimuat.
-- Hanya menambah kolom/tabel; jobId menjadi opsional. Voucher lama otomatis kind = JOB, FK job tetap RESTRICT.

-- CreateEnum
CREATE TYPE "VoucherKind" AS ENUM ('JOB', 'INVOICE', 'BILL');

-- AlterTable
ALTER TABLE "Voucher" ADD COLUMN     "billId" TEXT,
ADD COLUMN     "carriesTax" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "deductions" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "invoiceId" TEXT,
ADD COLUMN     "kind" "VoucherKind" NOT NULL DEFAULT 'JOB',
ADD COLUMN     "paymentId" TEXT,
ALTER COLUMN "jobId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "VoucherDocLine" (
    "id" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "invoiceLineId" TEXT,
    "billLineId" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "VoucherDocLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VoucherDocLine_invoiceLineId_key" ON "VoucherDocLine"("invoiceLineId");

-- CreateIndex
CREATE UNIQUE INDEX "VoucherDocLine_billLineId_key" ON "VoucherDocLine"("billLineId");

-- CreateIndex
CREATE INDEX "VoucherDocLine_voucherId_idx" ON "VoucherDocLine"("voucherId");

-- CreateIndex
CREATE UNIQUE INDEX "Voucher_paymentId_key" ON "Voucher"("paymentId");

-- CreateIndex
CREATE INDEX "Voucher_invoiceId_idx" ON "Voucher"("invoiceId");

-- CreateIndex
CREATE INDEX "Voucher_billId_idx" ON "Voucher"("billId");

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_billId_fkey" FOREIGN KEY ("billId") REFERENCES "VendorBill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoucherDocLine" ADD CONSTRAINT "VoucherDocLine_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "Voucher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoucherDocLine" ADD CONSTRAINT "VoucherDocLine_invoiceLineId_fkey" FOREIGN KEY ("invoiceLineId") REFERENCES "InvoiceLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoucherDocLine" ADD CONSTRAINT "VoucherDocLine_billLineId_fkey" FOREIGN KEY ("billLineId") REFERENCES "BillLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
