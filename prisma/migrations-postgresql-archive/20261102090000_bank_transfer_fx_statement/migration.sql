-- Transfer antar rekening, rekening valas (nilai valas per baris jurnal), dan import rekening koran.

-- AlterEnum
ALTER TYPE "JournalSource" ADD VALUE 'BANK_TRANSFER';

-- AlterTable
ALTER TABLE "JournalLine" ADD COLUMN "amountForeign" DECIMAL(18,2);

-- CreateTable
CREATE TABLE "BankStatementLine" (
    "id" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "balance" DECIMAL(18,2),
    "matchedLineId" TEXT,
    "matchedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankStatementLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BankStatementLine_matchedLineId_key" ON "BankStatementLine"("matchedLineId");
CREATE INDEX "BankStatementLine_bankAccountId_date_idx" ON "BankStatementLine"("bankAccountId", "date");

-- AddForeignKey
ALTER TABLE "BankStatementLine" ADD CONSTRAINT "BankStatementLine_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankStatementLine" ADD CONSTRAINT "BankStatementLine_matchedLineId_fkey" FOREIGN KEY ("matchedLineId") REFERENCES "JournalLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
