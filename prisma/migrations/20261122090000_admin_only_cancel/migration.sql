-- Permintaan client 17 Nov 2026: batal/hapus transaksi khusus Admin.
-- Di Role Management aturan ini lewat izin. Admin dan Super Admin (role sistem) memegang semua izin dari kode.
-- Migrasi ini hanya mengubah role bawaan Finance dan Operation; role kustom lain tidak disentuh.

-- 1. Cabut izin batal (dan pasangan *Own-nya) dari role bawaan Finance dan Operation.
UPDATE "AppRole"
SET "permissions" = (
      SELECT COALESCE(jsonb_agg(p.value ORDER BY p.ord), '[]'::jsonb)
      FROM jsonb_array_elements("permissions") WITH ORDINALITY AS p(value, ord)
      WHERE p.value #>> '{}' NOT IN (
        'invoices.cancel', 'invoices.cancelOwn',
        'vouchers.cancel', 'vouchers.cancelOwn',
        'cashEntry.cancel', 'cashEntry.cancelOwn', 'cashEntry.transferCancel', 'cashEntry.transferCancelOwn',
        'manualJournal.cancel', 'manualJournal.cancelOwn',
        'tax.cancel', 'tax.cancelOwn',
        'jobs.cancel'
      )
    ),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" IN ('FINANCE', 'OPERATION') AND "isSystem" = false;

-- 2. Edit vendor bill kini izin sendiri (bills.edit). Dulu ikut izin membuat bill, jadi role yang bisa membuat bill
--    tetap bisa mengedit (semua role non-sistem, supaya perilaku role kustom tidak berubah).
UPDATE "AppRole"
SET "permissions" = "permissions" || '["bills.edit"]'::jsonb,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "isSystem" = false
  AND "permissions" @> '["bills.create"]'::jsonb
  AND NOT "permissions" @> '["bills.edit"]'::jsonb;
