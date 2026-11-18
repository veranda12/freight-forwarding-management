-- Kondisi tarif baru: berlaku kecuali jalur merah. Nilai enum dipakai di migration berikutnya
-- (PostgreSQL tidak mengizinkan nilai enum baru dipakai di transaksi yang sama).
ALTER TYPE "TariffCondition" ADD VALUE 'NON_RED_LANE';
