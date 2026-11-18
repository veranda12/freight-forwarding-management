-- PPN masukan baris buying diketik nominal sesuai faktur vendor, tidak dari tarif. Kolom tarif tidak dipakai lagi.
ALTER TABLE "CostingLine" DROP COLUMN "ppnRate";
