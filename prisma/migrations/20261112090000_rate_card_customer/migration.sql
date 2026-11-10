-- Rate card per customer: baris dengan customerId menggantikan tarif standar untuk customer itu.
ALTER TABLE "RateCardItem" ADD COLUMN "customerId" TEXT;

CREATE INDEX "RateCardItem_customerId_idx" ON "RateCardItem"("customerId");

ALTER TABLE "RateCardItem" ADD CONSTRAINT "RateCardItem_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
