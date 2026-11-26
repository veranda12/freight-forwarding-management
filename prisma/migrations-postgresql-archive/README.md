# Arsip migrasi PostgreSQL — JANGAN dijalankan

Folder ini berisi 14 migrasi Prisma dari masa aplikasi memakai PostgreSQL (Oktober–November 2026). Disimpan hanya
sebagai referensi riwayat skema.

Sejak branch `feat/mariadb-migration`, database aplikasi adalah **MariaDB** (provider `mysql`). Migrasi yang berlaku
ada di `prisma/migrations/`, dimulai dari satu baseline `20261105120000_mariadb_baseline` yang setara dengan skema hasil
14 migrasi ini.

Catatan:
- SQL di sini khusus PostgreSQL (`CREATE TYPE`, `ALTER TYPE … USING ::`, `gen_random_uuid()`) dan tidak bisa
  dijalankan di MariaDB.
- Perubahan data di dalam migrasi lama (mis. akun 6310–6390, `invoiceSection` charge code, rekening bank default) pada
  instalasi baru sudah dibuat oleh seed (`prisma/seed-accounting-ext.ts`, `prisma/seed-clearance.ts`, `prisma/seed.ts`).
- Migrasi PostgreSQL dari branch client SLG (`20261106120000_slg_adjustments`, `20261107090000_bill_line_job`) dan dari
  `feat/slg-role-management-pg` (`20261108100000_super_admin`) ikut diarsipkan di sini saat di-merge; padanan MariaDB-nya
  ada di `prisma/migrations/` (`20261107120000_slg_adjustments`, `20261108100000_super_admin`).
- Sinkron client SLG + Role Management (2026-11-19, merge `feat/slg-role-management-pg` @ `a5048ae`): 15 migrasi PostgreSQL
  `20261109090000_payment_cancel` … `20261122090000_admin_only_cancel` diarsipkan di sini; padanan MariaDB-nya satu
  migrasi `prisma/migrations/20261122100000_slg_client_sync`.
- Merge client SLG `43c9900` (2026-11-23: akrual akhir bulan, rate card per kota, role Operation bawaan): 3 migrasi
  PostgreSQL `20261123090000_operation_slg_access`, `20261124090000_month_accrual`, `20261124100000_accrual_start_lines`
  diarsipkan di sini; padanan MariaDB-nya `prisma/migrations/20261124110000_slg_accrual_operation`.
- Rebranding SentraHub (2026-11-23, merge client `d1de500`): `20261125090000_company_sentra` diarsipkan di sini;
  padanan MariaDB-nya `prisma/migrations/20261125100000_company_sentra`.
- PPN per invoice 1,1%/11% dari biaya transportasi (2026-11-26, merge client `ae9a170`): `20261125090000_ppn_by_transport`
  diarsipkan di sini; padanan MariaDB-nya `prisma/migrations/20261125110000_ppn_by_transport` (`ILIKE` menjadi `LIKE`,
  kolasi `utf8mb4_unicode_ci` sudah tidak peka huruf besar/kecil).
