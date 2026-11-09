-- Pembatalan pelunasan oleh Admin
ALTER TABLE "Payment" ADD COLUMN "cancelledAt" TIMESTAMP(3);
ALTER TABLE "Payment" ADD COLUMN "cancelReason" TEXT;
ALTER TABLE "Payment" ADD COLUMN "cancelledById" TEXT;

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
