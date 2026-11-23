-- Akrual akhir bulan (permintaan client 20 Nov 2026): biaya job yang sudah ditagih ke customer tapi tagihan vendornya
-- belum dicatat sampai akhir bulan dijurnal saat closing (Dr beban, Cr 2050), lalu dibalik tanggal 1 bulan berikutnya.
ALTER TYPE "JournalSource" ADD VALUE IF NOT EXISTS 'ACCRUAL';

INSERT INTO "CoaAccount" ("id", "code", "name", "type", "normalBalance", "parentId", "isActive", "isPostable")
SELECT 'coa_accrued_ap_2050', '2050', 'Hutang Belum Ditagih (Akrual)', 'LIABILITY', 'CREDIT', NULL, true, true
WHERE NOT EXISTS (SELECT 1 FROM "CoaAccount" WHERE "code" = '2050');
