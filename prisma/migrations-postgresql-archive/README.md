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
