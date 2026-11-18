-- Closing bulanan menggantikan kunci "sampai tanggal". Setiap bulan bisa dibuka sendiri untuk koreksi.
CREATE TABLE "PeriodClosing" (
    "period" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedById" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "reopenedById" TEXT,
    "reopenReason" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PeriodClosing_pkey" PRIMARY KEY ("period")
);

-- Kunci lama dipindah: setiap bulan dari transaksi pertama sampai bulan tanggal kunci menjadi CLOSED.
INSERT INTO "PeriodClosing" ("period", "status")
SELECT to_char(m, 'YYYY-MM'), 'CLOSED'
FROM "AccountingSetting" s,
     LATERAL (SELECT min("date") AS first FROM "JournalEntry" WHERE "source" <> 'CLOSING') j,
     generate_series(
       date_trunc('month', (COALESCE(j.first, s."lockedUntil") AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta'),
       date_trunc('month', (s."lockedUntil" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta'),
       interval '1 month'
     ) m
WHERE s."id" = 'default' AND s."lockedUntil" IS NOT NULL;

ALTER TABLE "AccountingSetting" DROP COLUMN "lockedUntil";
