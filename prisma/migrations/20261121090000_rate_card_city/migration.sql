-- Tarif rate card per kota (Jakarta, Surabaya, ...). Kosong = semua kota.
ALTER TABLE "RateCardItem" ADD COLUMN "city" TEXT;
