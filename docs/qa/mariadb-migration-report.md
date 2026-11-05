# Laporan QA — Migrasi Database PostgreSQL → MariaDB

| | |
|---|---|
| Proyek | CargoFlow (FFMS) |
| Branch | `feat/mariadb-migration` (dari `main` @ `4cbf3e4`) |
| Tanggal uji | 2026-11-05 (WIB) |
| Penguji | Claude Code (atas permintaan Andhika) |
| Status akhir | **LULUS**: tidak ada regresi akibat perpindahan database; 6 cacat lama yang ditemukan (D-01…D-06) sudah diperbaiki dan diuji ulang (§10) |

## 1. Latar belakang dan ruang lingkup

Klien butuh hosting murah, dan VPS di luar anggaran. Hosting bersama umumnya hanya menyediakan MariaDB/MySQL, sehingga
database dipindah dari PostgreSQL 17 ke MariaDB. Target lokal adalah **MariaDB 12.3 LTS** (rilis LTS terbaru, GA Mei 2026).
Kandidat hosting belum ada, jadi kompatibilitas juga diuji di **MariaDB 10.11 LTS**, versi yang umum di hosting.

**Dalam cakupan:** skema & migrasi Prisma, kode akses data (raw SQL, transaksi, penomoran, pencarian), seed, skrip uji
integrasi, dan dokumentasi. **Di luar cakupan:** deploy ke hosting, pemindahan data produksi (belum ada; data masih
demo), serta perbaikan cacat lama yang ditemukan (dicatat di §6).

## 2. Lingkungan uji

| Komponen | Versi / konfigurasi |
|---|---|
| OS | Windows 11 Pro (laptop pengembang, RAM bebas ±0,9–2,8 GB) |
| Node.js / Next.js / Prisma / Playwright | 24.21.0 / 15.5.27 / 6.19.3 / 1.63.0 (Chromium headless shell) |
| MariaDB utama | **12.3.3** portabel, port 3307, `innodb_buffer_pool_size=128M`, `utf8mb4_unicode_ci`, `lower_case_table_names=2`, sql_mode strict bawaan, isolasi server bawaan REPEATABLE-READ |
| MariaDB kompatibilitas | **10.11.19** portabel, port 3308, konfigurasi sama |
| Baseline | PostgreSQL 17 (data seed pertama 2026-11-05, unit test, typecheck, lint) |
| Database | `ffms` (demo, untuk E2E/smoke) dan `ffms_test` (salinan `ffms` via `mariadb-dump`, untuk uji integrasi) |

Kedua MariaDB berupa ZIP resmi `archive.mariadb.org` (SHA256 cocok), dipasang di `D:\my-room\tools\` di luar repo dan
tanpa service Windows.

## 3. Analisis risiko (hasil kajian kode) dan pemetaan ke kasus uji

| ID | Risiko | Perubahan | Diuji oleh |
|---|---|---|---|
| T1 | Migrasi PG (`CREATE TYPE`, `::`, `gen_random_uuid()`) tidak jalan di MariaDB | Arsip `prisma/migrations-postgresql-archive/`, baseline baru `20261105120000_mariadb_baseline` | S-03, S-04 |
| T2 | `String` → `VARCHAR(191)`: teks panjang gagal disimpan | 47 kolom teks bebas `@db.Text` | TC-01 |
| T3 | Isolasi REPEATABLE READ (MariaDB) vs READ COMMITTED (PG) | `PRISMA_CLIENT_OPTIONS` (`src/lib/prisma-options.ts`) di semua PrismaClient | TC-04 + kontrol negatif B |
| T4 | `pg_advisory_xact_lock` tidak ada | Kunci baris `Sequence` `LOCK:TAX:<jenis>` lewat `nextCounter` | TC-04 |
| T5 | Raw SQL PG (`to_char`, `AT TIME ZONE`, `::`, `"…"`) | `masaTotals` dan filter nominal jurnal ditulis ulang | TC-05, S-07 |
| T6 | `mode: "insensitive"` tidak didukung Prisma MySQL | Dihapus; collation `_ci` | TC-02, S-07 |
| T7 | Upsert MySQL bukan `ON CONFLICT` → P2002 saat bersamaan | `nextCounter` coba ulang sekali | TC-03 + kontrol negatif A |
| T8 | Skrip QA integrasi memakai SQL PG | Di-port (`audit-ledger`, `report-balance`, guard `DATABASE()`) | S-05 |
| T9 | Collation `_ci`: unique/pencarian tak membedakan huruf besar/kecil | Diterima & didokumentasikan | TC-02, TC-02b |
| T10 | `lower_case_table_names` Windows vs Linux | Lokal `=2`; syarat hosting `=0` didokumentasikan | — (konfigurasi) |
| — | Presisi uang & kurs, utf8mb4, invarian jurnal | — | TC-06, TC-07, TC-08 |

## 4. Kriteria

- **Masuk:** branch dibuat, kode lolos typecheck, server MariaDB uji berjalan, DB kosong.
- **Keluar:** semua uji lulus atau setara baseline PG; tidak ada regresi; setiap kegagalan punya akar masalah yang
  terbukti dan diklasifikasikan.

## 5. Hasil uji

### 5.1 Ringkasan

| ID | Tingkat | Uji | Baseline PG | MariaDB 12.3 | MariaDB 10.11 |
|---|---|---|---|---|---|
| S-01 | Statis | `npm run typecheck` | lulus | **lulus** | — |
| S-02 | Statis | `npm run lint` | gagal 294 (konfigurasi ESLint, D-01) | gagal 294, **identik** | — |
| S-03 | Migrasi | `prisma validate` + `migrate deploy` ke DB kosong | — | **lulus** | **lulus** |
| S-04 | Migrasi | `migrate diff` DB ↔ skema (drift) | — | **tanpa beda** | **tanpa beda** |
| S-05 | Seed | `prisma db seed` ke DB kosong | TB 55.545.131.020,23 seimbang | **identik** (41 dtk) | **identik** |
| S-06 | Unit | `npm run test` (Vitest) | 169/169 | **169/169** | (tidak bergantung DB) |
| S-07 | Integrasi | 23 skrip `tests/integration` di `ffms_test` | tidak dijalankan¹ | 20 lulus, 3 gagal (cacat lama, §6) | 20 lulus, 3 gagal (sama persis) |
| S-08 | Risiko | `verify-mariadb.ts` TC-01…TC-08 (20 asersi) | n/a | **20/20** | **20/20** |
| S-09 | E2E | Playwright 17 skenario (build produksi) | tidak dijalankan¹ | **17/17** | — |
| S-10 | Smoke | Login 6 role × 43 halaman menu + endpoint kueri yang diubah | — | **0 error HTTP, 0 error log** | — |
| S-11 | Kontrol negatif | Membuktikan TC-03/TC-04 mendeteksi risikonya | n/a | lihat §5.3 | lihat §5.3 |

¹ Atas keputusan pemilik, DB PostgreSQL tidak di-reset (seed ulang gagal karena D-02 dan sebagian data demo PG terhapus).
Pembanding PG = keluaran seed pertama (jumlah baris per entitas, Trial Balance, total invoice clearance), unit test,
typecheck, dan lint. Seluruh angka seed di MariaDB 12.3 dan 10.11 **identik** dengan pembanding itu: user 8,
customer 60, vendor 20, agen 15, job 300, invoice 292, bill 292, payment 440, jurnal 1.055, quotation 25; invoice clearance
49.847.370 dan 42.411.546.

### 5.2 Kasus uji risiko (`tests/integration/verify-mariadb.ts`)

| ID | Langkah | Harapan | 12.3 | 10.11 |
|---|---|---|---|---|
| TC-01 | Simpan alamat customer 1.010 karakter dan deskripsi jurnal + baris 1.920 karakter | Tersimpan utuh | lulus | lulus |
| TC-02 | `contains` huruf kecil/besar pada nama customer, nomor job; `searchJournals` "catatan PANJANG" vs "CATATAN panjang" | Hasil sama | lulus | lulus |
| TC-02b | Buat customer kode `zzt-…` saat `ZZT-…` sudah ada | Ditolak P2002 (unique `_ci`, perilaku terdokumentasi) | lulus | lulus |
| TC-03 | 20 transaksi paralel `genDocNumber` pada key baru | Tanpa error; nomor unik 1..20 | lulus | lulus |
| TC-04 | 2 `remitTaxPeriod` paralel, masa sama: PPh 23 (kunci baru), PPN (kunci baru), PPh 23 setelah batal (kunci lama) | Tepat 1 berhasil, 1 ditolak "sudah disetor seluruhnya" | lulus (3/3) | lulus (3/3) |
| TC-05 | Jurnal PPN tgl terakhir 23.30 WIB dan tgl 1 00.30 WIB | Masuk masa yang benar | lulus | lulus |
| TC-06 | Debit 9.876.543.210.123,45; kurs 16.234,123456 | Bolak-balik tanpa pembulatan | lulus | lulus |
| TC-07 | Nama customer berisi emoji, aksara Han, diakritik | Tersimpan utuh (utf8mb4) | lulus | lulus |
| TC-08 | Jurnal tidak seimbang; posting di periode terkunci; reversal | Ditolak / ditolak / pembalik seimbang | lulus | lulus |

### 5.3 Kontrol negatif (membuktikan perbaikan memang diperlukan)

Skrip `Claude outputs/mariadb/negative-control.ts` (di luar git) menjalankan skenario yang sama **tanpa** perbaikan:

| Skenario | MariaDB 12.3 | MariaDB 10.11 |
|---|---|---|
| A. 20 upsert `Sequence` paralel pada key baru tanpa coba ulang | 6/20 gagal P2002 | 7/20 gagal P2002 |
| B. 2 setor PPh 23 paralel, client **tanpa** READ COMMITTED | 1 berhasil, 1 gagal **error sistem 1020** "Record has changed since last read" (`innodb_snapshot_isolation`, bawaan sejak 11.6) | **2 berhasil, 2 POSTED = SETOR PAJAK GANDA** (2/2 percobaan) |

Temuan tambahan: di REPEATABLE READ, coba ulang P2002 pada `nextCounter` juga **tidak** menolong, karena snapshot lama
tidak melihat baris yang baru di-commit. Kedua perbaikan (READ COMMITTED + coba ulang) diperlukan bersama.

### 5.4 Smoke per role (MariaDB 12.3, build produksi)

| Role | Halaman 200 | Redirect RBAC | Error |
|---|---|---|---|
| Admin | 43 | 0 | 0 |
| Sales | 34 | 9 | 0 |
| Operation | 35 | 8 | 0 |
| Documentation | 32 | 11 | 0 |
| Finance | 39 | 4 | 0 |
| Management | 43 | 0 | 0 |

Endpoint kueri yang diubah: `/api/search?q=job/sea` = `?q=JOB/SEA` (840 byte, identik); `/api/accounting/journals`
dengan `q` + `min`/`max` (raw SQL) memberi hasil identik untuk "PELUNASAN"/"pelunasan"; `/accounting/tax`
(`masaTotals`) 200. Log aplikasi (`logs/app-2026-11-05.log`) tanpa error baru.

## 6. Cacat yang ditemukan

Tidak ada cacat yang disebabkan perpindahan database. Semua di bawah ini **sudah ada sebelumnya** dan tidak bergantung
pada jenis database. Tabel ini adalah kondisi saat ditemukan; semuanya sudah diperbaiki sesudahnya (lihat §10).

| ID | Severity | Temuan | Bukti / akar masalah | Usul |
|---|---|---|---|---|
| D-01 | Rendah | `npm run lint` gagal 294 error `Definition for rule '@typescript-eslint/no-unused-vars' was not found` | `.eslintrc.json` memakai aturan plugin `@typescript-eslint` yang tidak dimuat konfigurasi `next/core-web-vitals`. Identik di baseline PG | Tambah `plugin:@typescript-eslint/recommended` atau hapus aturan itu |
| D-02 | Sedang | `prisma db seed` gagal bila DB sudah berisi (README dulu menyebut "idempoten") | `prisma/seed.ts` menghapus `Customer` sebelum `DomesticShipment` → P2003 FK `DomesticShipment_customerId_fkey`; transaksi hapus sebelumnya sudah ter-commit sehingga data demo terhapus sebagian. Terjadi di PG saat baseline | Hapus tabel domestik (dan anak lain) sebelum `customer.deleteMany()` |
| D-03 | Sedang | Instalasi baru tidak punya vendor luar negeri → PPh 26 tidak pernah aktif; `verify-pph26` gagal "Tidak ada biaya beli dari vendor luar negeri", `simulate-panduan-e2e` gagal "Maersk Line ditandai vendor luar negeri" | `Vendor.isForeign` hanya diisi UPDATE di migrasi lama `20261028090000_pph26_foreign_vendor`, yang pada DB kosong berjalan sebelum seed. Seed tidak mengisinya. Dengan UPDATE yang sama diterapkan manual: `verify-pph26` **10/10 lulus** di MariaDB | Seed mengisi `isForeign: true` untuk SHIPPING_LINE/AIRLINE |
| D-04 | Rendah | 6 nomor container demo tidak lolos ISO 6346 (`verify-job-containers`) | Ditulis tangan di `prisma/seed-clearance.ts` (mis. `MSCU1234565`, `CAIU1234567`, `TGHU7654321`, `MSCU2034561`, `TGBU2087654`, `MEDU4412873`) dengan digit cek salah | Ganti dengan nomor yang digit ceknya benar |
| D-05 | Rendah | `simulate-panduan-e2e` "laba berjalan naik 5.000.000 − 6.500 − 2.750.000" gagal bila dijalankan sebelum 12.00 WIB | Kas keluar 2.750.000 bertanggal hari ini 12.00 WIB (`src/lib/cash-entry.ts:44`), sedangkan neraca diambil per "sekarang" (10.44 WIB) → jurnal belum terhitung; selisih aktual persis 2.750.000 (4.993.500 vs 2.243.500). Uji bergantung jam | Ambil neraca per akhir hari, bukan `new Date()` |
| D-06 | Info | Pada instalasi baru, 12 `ChargeCode` ber-`invoiceSection` NULL | UPDATE di migrasi lama `20261105090000_invoice_print_rate_card` berjalan sebelum seed (sama di PG) | Seed mengisi `invoiceSection` |

## 7. Perubahan perilaku yang disengaja (perlu diketahui pengguna)

1. **Pencarian dan unique tidak membedakan huruf besar/kecil.** Kode customer `ABC` dan `abc` dianggap sama
   (sebelumnya di PG unique membedakannya).
2. **Urutan NULL**: pada urutan naik MariaDB menaruh NULL di awal (PG di akhir). Hanya ditemukan pengurutan pada kolom
   non-null (`code`, `name`), jadi tidak berdampak saat ini.
3. Tabel `Sequence` kini juga berisi baris kunci `LOCK:TAX:PPN|PPH23|PPH26` per masa. Tidak ditampilkan di UI.

## 8. Risiko sisa dan rekomendasi

| Risiko | Rekomendasi |
|---|---|
| Hosting belum dipilih; aplikasi Next.js butuh Node.js persisten | Pilih hosting dengan "Setup Node.js App" (CloudLinux/cPanel) + MariaDB ≥ 10.11; uji ulang `verify-mariadb.ts` dan smoke di hosting sebelum go-live |
| Konfigurasi MariaDB hosting (sql_mode non-strict, `lower_case_table_names`) | Cek `SELECT @@sql_mode, @@lower_case_table_names` di hosting; strict wajib agar data tidak terpotong diam-diam |
| Prisma query engine di OS hosting | Tambahkan `binaryTargets` yang sesuai (mis. `rhel-openssl-1.0.x`/`debian-openssl-3.0.x`) saat hosting diketahui |
| `PrismaClient` baru tanpa `PRISMA_CLIENT_OPTIONS` | Aturan di `DECISIONS.md`; pertimbangkan lint rule/ulasan kode |
| Perbedaan concurrency lain di luar alur yang diuji | Isolasi kini sama dengan PG; uji beban ringan di hosting bila ada fitur paralel baru |
| E2E baseline PG tidak tersedia | E2E MariaDB 17/17 lulus; pembanding E2E PG tidak dibutuhkan untuk keputusan go/no-go |

## 9. Artefak

- Kode & migrasi: commit `4ddefcf`, `10ed14b`, `5bfe3bd`, `6fd40d9`, `9c5106e`, `cf3a3c3` di branch
  `feat/mariadb-migration` (belum di-push).
- Log mentah (di luar git): `Claude outputs/mariadb/` → `baseline-pg/`, `mariadb-12.3/` (seed, unit, lint, build,
  e2e, smoke, integration), `mariadb-10.11/` (migrate, seed, integration, negative-control), `negative-control*.log`.
- Alat uji (di luar git): `run-integration.sh`, `smoke-roles.sh`, `negative-control.ts`.
- Server uji lokal: `D:\my-room\tools\mariadb-12.3.3-winx64` (data `mariadb-12.3-data`, port 3307) dan
  `mariadb-10.11.19-winx64` (port 3308); kata sandi root acak di `mariadb-*-root-password.txt` di folder yang sama.
- Log perbaikan & uji ulang (di luar git): `Claude outputs/mariadb/fix-verify/`.

## 10. Perbaikan cacat lama dan uji ulang (2026-11-05, ±11.00–11.15 WIB)

| ID | Perbaikan | Commit |
|---|---|---|
| D-01 | `.eslintrc.json` memuat `next/typescript`, sehingga aturan `@typescript-eslint/*` dikenali. Lint exit 0; tersisa 12 peringatan lama (import tak terpakai, 1 `alt-text` di PDF), tidak disentuh | `9c5106e` |
| D-02 | `prisma/seed.ts` mengosongkan semua tabel aplikasi (daftar dari `information_schema`, kecuali `_prisma_migrations`) dengan `FOREIGN_KEY_CHECKS=0` dalam satu transaksi, sehingga seed ulang = seed ke DB kosong | `cf3a3c3` |
| D-03 | Seed membuat vendor `SHIPPING_LINE`/`AIRLINE` dengan `isForeign: true` (aturan migrasi `20261028090000`) | `cf3a3c3` |
| D-04 | 6 nomor container demo memakai digit cek benar (`MSCU1234566`, `CAIU1234561`, `TGHU7654320`, `MSCU2034562`, `TGBU2087659`, `MEDU4412879`); ekspektasi di `verify-clearance-invoice.ts` disesuaikan. Ditemukan juga: skrip itu membuat container uji `TEST000000x` yang tidak valid dan menggagalkan `verify-job-containers` bila dijalankan sesudahnya; diganti `TSTU0000009/14/20` | `cf3a3c3` |
| D-05 | `simulate-panduan-e2e.ts` mengambil saldo per akhir hari WIB (`AS_OF`), bukan `new Date()` | `cf3a3c3` |
| D-06 | Charge code seed (`seed.ts`, `seed-domestic.ts`) diberi `invoiceSection` sesuai aturan migrasi `20261105090000` (FREIGHT/DOCUMENTATION/LOCAL) | `cf3a3c3` |

Uji ulang sesudah perbaikan (DB demo `ffms` **tidak** disentuh; seed ulang dan E2E memakai `ffms_test`):

| Uji | MariaDB 12.3 | MariaDB 10.11 |
|---|---|---|
| Seed 2× berturut-turut di DB yang sudah berisi | lulus, run 1 = run 2, TB 55.545.131.020,23 | lulus, identik dengan 12.3 |
| Vendor luar negeri / charge code tanpa `invoiceSection` / container tidak valid | 12 / 0 / 0 | sama |
| 23 skrip `tests/integration` | **23/23 lulus**, 313 asersi PASS, 0 FAIL | **23/23 lulus**, 313 PASS, 0 FAIL |
| Unit (Vitest) / typecheck / lint | 169/169 / lulus / exit 0 | — |
| E2E Playwright (server diarahkan ke `ffms_test` hasil seed baru) | **17/17** | — |
| Smoke 6 role × 43 halaman | 0 error | — |

`simulate-panduan-e2e` lulus saat dijalankan pukul ±11.10 WIB (sebelumnya selalu gagal sebelum 12.00), membuktikan D-05.
Catatan: DB demo `ffms` di MariaDB masih berisi data seed versi lama (sebelum perbaikan D-03/D-04/D-06) ditambah data
dari E2E. Untuk menyegarkannya: `npm run db:seed` (mengosongkan dan mengisi ulang DB demo).

## 11. E2E MariaDB 10.11 dan penelusuran manual `DEMO.md` (2026-11-05, 11.30–11.45 WIB)

### 11.1 E2E Playwright di MariaDB 10.11.19

Server diarahkan ke `ffms_test` 10.11 hasil seed baru. **17/17 lulus**; smoke 6 role × 43 halaman tanpa error. Invoice
yang dibuat E2E tercatat di DB 10.11 (04.33 UTC), membuktikan aplikasi benar-benar menulis ke 10.11.

### 11.2 Penelusuran skenario demo di Chrome (MariaDB 12.3, DB `ffms_test` hasil seed baru)

Dijalankan lewat Claude in Chrome seperti pengguna (klik, form, dialog), dengan cek silang ke DB. Screenshot di
`Claude outputs/mariadb/chrome-walkthrough/` (di luar git).

| Babak | Langkah | Hasil |
|---|---|---|
| 1 Management | Login lewat form → dashboard KPI, grafik volume, revenue vs cost, Top 10 | Lulus |
| 2 Sales | Quotation Sent `QUO/2026/10/0012`: charge USD/IDR, margin otomatis Rp 3.818.232 (20,9%) | Lulus; kurs 15.909,3 utuh (USD 110 = Rp 1.750.023) |
| 3 Convert | Terima → Convert ke Job → `JOB/SEA-IMP/2026/11/0007`, revenue/cost/profit = quotation | Lulus **sebagai Admin**; gagal sebagai Sales (D-07) |
| 4 Operation | 7 tab job berisi data; ubah status → Stuffing / Pickup (langsung tampil); centang milestone | Status lulus; milestone tersimpan di DB tetapi tampilan baru berubah setelah reload (D-09). Jam aktual 11.38 WIB = 04.38 UTC (zona waktu benar) |
| 5 Dokumen | House B/L, Master B/L, SI, Arrival Notice, DO | 5/5 PDF valid (`%PDF-`), kop PT Samudra Lintas Logistik, data sesuai job |
| 6 Tracking publik | `/track/JOB/SEA-IMP/2026/11/0002` | 200 tanpa login; milestone terbaru tampil; 0 kemunculan Rp/revenue/profit/margin |
| 7 Finance | Costing (margin < 10% merah); invoice dari job: subtotal 25.882.876,91, PPN 605.550 (hanya baris kena PPN), total 26.488.426,91; jurnal JE/…/0019 seimbang; pembayaran dengan potongan PPh 23 67.200 → Paid, sisa 0, jurnal JE/…/0020 seimbang sampai sen; invoice kedua dibatalkan → JE/…/0021 ditandai batal, pembalik JE/…/0022 (tidak ada yang dihapus); Trial Balance & Neraca "Balance ✓" (aset 8.978.867.428 = pasiva) | Lulus |
| 8 Reporting | 5 tab laporan; Export Excel Profitability (303 job), AR Aging (41 customer), AP Aging (18 vendor) | Lulus; XLSX valid, total AP 3.832.068.369,55 = layar (D-11 kosmetik) |

Log aplikasi selama penelusuran: hanya 1 error (penolakan hak akses D-07), tanpa error browser.

### 11.3 Temuan baru dari penelusuran (semua di luar lapisan database, belum diperbaiki)

| ID | Severity | Temuan | Bukti | Usul |
|---|---|---|---|---|
| D-07 | **Sedang** | Quotation hanya bisa dikonversi ke Job oleh **Admin**. Tombol tampil bila punya hak tulis `quotations` (Sales), tetapi server mensyaratkan hak tulis `jobs` (Operation); Sales hanya melihat toast "Gagal konversi ke job." tanpa alasan. `DEMO.md` Babak 3 menggambarkan Sales yang mengonversi | `src/app/(app)/quotations/[id]/page.tsx:22,42`, `src/app/(app)/quotations/actions.ts:88`, `src/lib/rbac.ts:66,68`; log `ForbiddenError … write pada jobs` | **Keputusan bisnis**: siapa yang boleh konversi. Lalu samakan syarat tombol dan server, dan tampilkan pesan error dari server |
| D-08 | Info | Konversi quotation tidak mengisi POL/POD job (quotation menyimpan rute sebagai teks bebas) | Job 0007: Rute "- → -" padahal quotation Shanghai → Jakarta | Isi POL/POD manual, atau pemetaan teks → master port |
| D-09 | Rendah | Centang milestone tersimpan, tetapi timeline tidak diperbarui sampai halaman di-reload (aksi lain seperti Ubah Status ikut memperbaruinya) | DB `isDone=1` 04.38/04.39 UTC; UI tetap kosong setelah 6 detik | Periksa `router.refresh()` di `milestone-timeline.tsx` / sistem tab aplikasi |
| D-10 | Rendah | Tombol "Catat Pembayaran" tetap tampil di invoice yang dibatalkan (server menolak: `receivables.ts:112`) | Screenshot INV/2026/11/0006 | Sembunyikan bila status CANCELLED |
| D-11 | Rendah | Baris TOTAL Excel aging berisi galat floating point (`1216815106.6399999`) | Isi XLSX | Bulatkan (`r2`) sebelum ditulis ke sel |
