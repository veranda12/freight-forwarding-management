-- Baris pajak voucher (diketik Finance) dan kotak dokumen SOP pada cetakan bukti.
-- Hanya menambah tabel; data lama tidak berubah (voucher lama tanpa pajak: total = jumlah biaya).

-- CreateEnum
CREATE TYPE "TaxRowKind" AS ENUM ('PPN_IN', 'PPH23', 'PPH26');

-- CreateTable
CREATE TABLE "ProofForm" (
    "code" TEXT NOT NULL,
    "docNo" TEXT,
    "revision" TEXT,
    "effectiveDate" DATE,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProofForm_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "VoucherTaxLine" (
    "id" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "kind" "TaxRowKind" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "VoucherTaxLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VoucherTaxLine_voucherId_idx" ON "VoucherTaxLine"("voucherId");

-- AddForeignKey
ALTER TABLE "VoucherTaxLine" ADD CONSTRAINT "VoucherTaxLine_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "Voucher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

