-- Edit dan batal vendor bill: baris buying tahu bill pemiliknya, bill menyimpan alasan dan waktu pembatalan.
ALTER TABLE "CostingLine" ADD COLUMN "billId" TEXT;

CREATE INDEX "CostingLine_billId_idx" ON "CostingLine"("billId");

ALTER TABLE "CostingLine" ADD CONSTRAINT "CostingLine_billId_fkey" FOREIGN KEY ("billId") REFERENCES "VendorBill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "VendorBill" ADD COLUMN "cancelReason" TEXT;
ALTER TABLE "VendorBill" ADD COLUMN "cancelledAt" TIMESTAMP(3);
