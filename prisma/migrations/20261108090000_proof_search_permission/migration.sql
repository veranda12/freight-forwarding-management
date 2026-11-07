-- Menu Cari Bukti (part2 client SLG): izin proofs.view untuk role bawaan yang sudah tersimpan.
-- Role kustom buatan admin tidak diubah. Tanpa perubahan skema.
UPDATE `AppRole` SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'proofs.view') WHERE `id` = 'role_admin' AND NOT JSON_CONTAINS(`permissions`, '"proofs.view"');
UPDATE `AppRole` SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'proofs.view') WHERE `id` = 'role_sales' AND NOT JSON_CONTAINS(`permissions`, '"proofs.view"');
UPDATE `AppRole` SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'proofs.view') WHERE `id` = 'role_finance' AND NOT JSON_CONTAINS(`permissions`, '"proofs.view"');
UPDATE `AppRole` SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'proofs.view') WHERE `id` = 'role_management' AND NOT JSON_CONTAINS(`permissions`, '"proofs.view"');
