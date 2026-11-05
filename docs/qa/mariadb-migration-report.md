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

## 12. Apakah D-07…D-11 akibat migrasi? Pembanding PostgreSQL (2026-11-05, 13.00–13.25 WIB)

**Kesimpulan: tidak. Kelimanya terjadi persis sama di PostgreSQL.**

Metode:
1. **Kode:** `git diff main..feat/mariadb-migration` tidak mengubah satu pun berkas yang terkait D-07…D-11 (`rbac.ts`,
   modul quotation/job/invoice, export Excel, auth). Perubahan `src/` migrasi hanya 6 berkas akses data (pencarian,
   pajak, penomoran, opsi Prisma).
2. **Uji langsung:** `main` (kode PostgreSQL asli) dijalankan di git worktree terpisah `../ffms-pg-check` dengan
   PostgreSQL 17 dan database **baru** `ffms_pgcheck` (migrate + seed; DB PG `ffms` lama tidak disentuh), port 3001.
   Skenario yang sama dijalankan di Chrome dan dicek ke DB.

| ID | PostgreSQL (`main`) | MariaDB (branch) | Kesimpulan |
|---|---|---|---|
| D-07 | Sales: tombol Convert tampil → toast "Gagal konversi ke job.", tetap di halaman; Operation: tombol tidak ada; Admin: berhasil (`JOB/SEA-EXP/2026/11/0001`) | Sama | Cacat lama logika hak akses |
| D-08 | Job hasil convert: Rute "- → -", POL kosong (quotation Jakarta → Rotterdam) | Sama | Desain lama (rute quotation = teks bebas) |
| D-09 | Milestone `isDone=true` di DB (06.18 UTC), tampilan tidak berubah setelah 6 dtk | Sama | Cacat lama tampilan |
| D-10 | Invoice Cancelled, tombol "Catat Pembayaran" tetap tampil | Sama | Cacat lama tampilan |
| D-11 | TOTAL Excel `1542036833.0700004`, `3203871258.7200003` | Sama (letak galat beda karena urutan penjumlahan; nilai ke sen identik: AR 3.203.871.258,72, AP 3.832.068.369,55) | Cacat lama (penjumlahan float di JS) |

Mengapa D-07 bisa terlihat "tidak ada" di PostgreSQL: form login **terisi otomatis `admin@demo.com` / `demo123`**
(`src/app/login/login-form.tsx:37,41`). Klik **Masuk** tanpa mengganti email = masuk sebagai Admin, satu-satunya role
yang bisa convert sebelum perbaikan.

Paritas data tambahan: invoice pertama yang dibuat dari `JOB/SEA-IMP/2026/11/0002` di kedua DB bernomor sama
(`INV/2026/11/0005`) dengan nilai sama (subtotal 25.882.876,91, PPN 605.550, total 26.488.426,91).

### 12.1 Perbaikan D-07 (commit `cac5705`)

- `canConvertQuotation()` di `src/lib/rbac.ts`: Sales (pemilik quotation), Operation (pembuat job), Admin. Dipakai
  bersama oleh tombol (`quotations/[id]/page.tsx`) dan server action (`quotations/actions.ts`), sehingga syaratnya tidak
  bisa berbeda lagi. Tombol Kirim/Terima/Tolak tetap hanya untuk hak tulis `quotations`.
- Gagal → pesan dari server ditampilkan (bukan lagi selalu "Gagal konversi ke job.").
- Uji: unit `canConvertQuotation` (171/171), E2E baru `e2e/quotation-convert.spec.ts` (Sales convert, Operation
  convert, Finance tanpa akses) → **E2E 20/20 lulus** di MariaDB 12.3; audit log mencatat convert oleh SALES dan
  OPERATION. Build, typecheck, lint lulus.

D-08…D-11 belum diperbaiki (cacat lama, bukan migrasi); menunggu keputusan pemilik.

## 13. Perbaikan D-08 sampai D-11 (commit `f1fe007`, 2026-11-05 ±13.30–14.00 WIB)

| ID | Akar masalah (terbukti) | Perbaikan |
|---|---|---|
| D-08 | Quotation menyimpan rute sebagai teks bebas, job memakai relasi master Port/Airport; convert tidak memetakan | `src/lib/route-match.ts`: kode dalam kurung (UNLOCODE untuk laut, IATA untuk udara), lalu nama kota/pelabuhan; dipakai **hanya bila cocok tepat satu**, selain itu tetap kosong (tidak menebak). Mode darat/customs tidak dipetakan |
| D-09 | Lebih serius dari dugaan awal. Dibuktikan di browser (penyadap `fetch`, DB, curl): server action dan refresh selesai 200 dalam ±0,1 dtk dengan data baru, tetapi transisi React "server action + `router.refresh()`" di komponen milestone **tidak pernah selesai**: tampilan tidak memakai data baru dan **semua tombol milestone terkunci**; klik berikutnya (setelah tombol terbuka oleh aksi lain) bisa **membalik** milestone yang sudah tercentang tanpa terlihat (terjadi pada uji: Gate In CY kembali 0) | `milestone-timeline.tsx`: status centang dipegang lokal (optimistic) dan disinkronkan dari props, penanda sibuk per klik dilepas di `finally`, rollback + toast bila gagal, `router.refresh()` di luar transisi; "Tambah Milestone" diperlakukan sama. Tombol diberi `aria-pressed` |
| D-10 | Tombol bayar invoice hanya mensyaratkan `outstanding > 0` | Prop `payable` (bukan CANCELLED/PAID), sama dengan pola halaman Vendor Bill |
| D-11 | Aging dijumlahkan float tanpa pembulatan | `roundAging()` di `src/lib/accounting.ts` membulatkan baris, bucket, dan total ke sen (berlaku untuk layar dan Excel) |

Uji ulang (MariaDB 12.3, `ffms_test` bersih dari snapshot seed):

| Uji | Hasil |
|---|---|
| Build / typecheck / lint | Lulus (lint: 12 peringatan lama yang sama) |
| Unit (Vitest) | **174/174** (baru: `route-match.test.ts`) |
| Integrasi | **24/24** skrip, 325 asersi PASS, 0 FAIL (baru: `verify-route-aging.ts`: 8 kasus pemetaan rute + pembulatan aging AR/AP) |
| E2E (Playwright) | **22/22** (baru: `job-invoice-ui.spec.ts` D-09: centang tampil tanpa reload, tombol aktif, batal centang, tersimpan setelah reload; D-10: invoice batal tanpa tombol Catat Pembayaran) |
| D-08 di DB | Job hasil convert E2E: Singapore → Jakarta (IDTPP) = `SGSIN → IDTPP`; Shanghai → Jakarta (IDTPP) = `CNSHA → IDTPP`. Dari 25 quotation seed, 24 terpetakan penuh; 1 (AIR ke Rotterdam) tujuan tetap kosong karena master Airport tidak punya Rotterdam |
| D-11 di Excel | Unduhan AR/AP aging: 258 + 114 angka, **0** yang lebih dari 2 desimal (TOTAL `1542036833.07`, sebelumnya `1542036833.0700004`) |

Status akhir semua temuan: D-01…D-11 **diperbaiki dan diuji**. Tidak ada satu pun yang disebabkan perpindahan database.

## 14. Role Management (2026-11-05; commit `4d45966`, `aadc37f`)

Fitur baru atas permintaan pemilik (bukan bagian migrasi DB): role kustom, izin per menu/tombol/persetujuan,
maker-checker, dan batas data. Desain lengkap di `DECISIONS.md` § Role Management; katalog izin
`src/lib/permissions.ts` (124 izin).

| Uji | Hasil |
|---|---|
| Migrasi `20261106090000_role_management` pada DB **berisi data** (skema lama) | Lulus; 8 user terpetakan tepat ke role-nya; `migrate diff` tanpa beda |
| Seed (dengan role & user Operation kedua) | Lulus; Trial Balance tetap 55.545.131.020,23 |
| Typecheck / lint / build | Lulus (lint: 12 peringatan lama yang sama) |
| Server action memanggil `assertPerm` | 81/81 (2 lainnya login/logout) — dicek skrip |
| Unit | 175/175 (baru: `permissions.test.ts`) |
| Integrasi | **25/25 skrip, 355 asersi PASS, 0 FAIL** (baru: `verify-permissions.ts` — role DB = katalog; batas data Sales: quotation 11/25, customer 27/61, job 132/303, invoice 125/296, STT 25/37, semuanya milik sendiri; maker-checker) |
| E2E | **25/25** (baru: `quotation-flow.spec.ts` 4 skenario, `role-management.spec.ts` 2 skenario) |
| Smoke 7 user × 44 halaman | 0 error HTTP, 0 error log; Admin & Management 44 halaman, role lain diarahkan sesuai izin |

Temuan & keputusan selama pengujian:
- **Redirect berputar** untuk user yang dinonaktifkan (token masih sah: `/login` → `/dashboard` → `/login`) — diperbaiki:
  halaman login memeriksa user aktif dari DB.
- Default maker-checker untuk pembatalan dokumen keuangan/STT **tidak** diaktifkan (role awal Finance/Operation memegang
  `*Own`) agar perilaku lama tetap; satu-satunya maker-checker bawaan adalah aturan quotation yang diminta. Admin bisa
  mengaktifkan yang lain dengan mencabut izin `*Own`.
- Halaman detail ber-`loading.tsx` mengembalikan HTTP 200 untuk `notFound()` (streaming); data di luar batas tetap tidak
  tampil (diverifikasi lewat curl: nomor quotation milik Sales lain tidak ada di HTML).

## 15. Uji end-to-end komprehensif: alur per role, keamanan, anomali, regresi (2026-11-05, ±15.30–16.50 WIB)

Suite baru `e2e/qa/` (Playwright). Setiap uji memeriksa UI **dan** kebenaran data di database (`qa-helpers.ts`, menolak
berjalan di DB demo `ffms`), termasuk buku besar seimbang setelah setiap langkah akuntansi. Uji penolakan memakai
*server action* asli yang direkam dari user berhak lalu dikirim ulang (*replay*) oleh user yang tidak berhak, disertai
**kontrol positif** (replay yang sama oleh user berhak berhasil), supaya penolakan terbukti karena otorisasi.
Suite QA membuat draft quotation sendiri (`newDraft`) sehingga tidak menghabiskan data seed untuk spec lain.

| Suite | Cakupan | Hasil |
|---|---|---|
| QA-01 Ekspor lintas role | Sales buat via form → ajukan (tanpa tombol Kirim/Terima/Convert) → Operation kirim (tidak bisa memutuskan sendiri) → Operation lain terima + convert (POL/POD, costing, Sales PIC) → container ISO 6346 tidak valid ditolak / valid diterima, milestone, status → Documentation cetak 5 PDF tanpa bisa mengubah job → Finance invoice + receipt (PAID), bill + bayar → visibilitas Sales/Manager + Excel → tracking publik tanpa harga | 10/10 |
| QA-02 Domestik | STT oleh Sales, status sampai diterima (POD wajib nama penerima), invoice sekali saja + receipt, batas data (Sales lain: detail, invoice, PDF STT 404), tracking, pembatalan oleh Operation (STT batal tidak bisa ditagih) | 6/6 |
| QA-03 Akuntansi | Kas keluar + batal (jurnal pembalik), transfer + batal, setor pajak + batal, **maker-checker diatur Admin** (cabut `manualJournal.cancelOwn` → Finance ditolak membatalkan jurnalnya sendiri → kembalikan → langsung boleh tanpa login ulang), tutup buku 2025, kunci periode (posting tanggal terkunci ditolak, setelah dibuka bisa) | 6/6 |
| QA-04 Keamanan | Tanpa login (6 halaman → login; 5 API tanpa PDF/Excel), replay Kirim oleh Sales, Terima oleh pengirim sendiri, Convert oleh Sales, simpan role oleh Finance (eskalasi ke semua izin), Sales mengubah dirinya jadi Admin, batal invoice oleh Operation; user dinonaktifkan di tengah sesi (halaman & API 401); batas data lintas modul (job, invoice, PDF invoice/dokumen, pencarian, Excel 403) | 9/9 |
| QA-05 Anomali | Dua Operation menekan Kirim bersamaan → tepat satu berhasil; ajukan ulang, Terima pada Draft, keputusan tak dikenal ditolak; convert ganda → 1 job; pembayaran berlebih/negatif/nol/potongan negatif/ke invoice batal ditolak, pembayaran sebagian sah → PARTIAL; XSS di nama customer tampil sebagai teks, unicode + alamat 1.000 karakter utuh; pencarian dengan injeksi SQL, `%`, `_`, backslash, 3.000 karakter → 200 tanpa error; validasi form (quotation tanpa customer, email ganda beda huruf besar/kecil, password pendek, nama role ganda); Admin tidak bisa menonaktifkan dirinya (UI & replay) | 7/7 |
| QA-06 Matriks role | 6 role × 13 halaman: akses halaman, tombol "… Baru", menu sidebar, bilah tab, dan KPI uang dashboard dibandingkan dengan izin role **di database**; tab tidak terwariskan antar user; tidak ada error JavaScript/hydration di 10 halaman utama | 8/8 |

### 15.1 Cacat yang ditemukan dan diperbaiki

| ID | Temuan | Perbaikan | Bukti |
|---|---|---|---|
| D-12 | Bilah tab membuat tab untuk halaman yang **tidak diizinkan** (Documentation: Quotation, Customer, Vendor, Rate…). Halaman ber-`loading.tsx` sempat aktif di klien sebelum server mengalihkan. Isi halaman tidak bocor. | `tabs-context.tsx`: tab hanya untuk item menu yang diizinkan; tab tersimpan disaring ulang saat dipulihkan | QA-06 merah sebelum perbaikan (docs, finance), hijau sesudahnya |
| D-13 | Tab (termasuk judul seperti nomor invoice) **terwariskan ke user berikutnya** yang login di tab browser yang sama (`sessionStorage` tidak per user) | Kunci penyimpanan `app-tabs:<email>` | QA-06 "tidak terwariskan" |
| D-14 | Dashboard menampilkan **Revenue, Gross profit, grafik Revenue vs Cost dan Top Customer** ke role tanpa izin keuangan (Documentation) | Hanya bila `jobs.viewFinancials` atau `costing.view` (Sales, Operation, Finance, Management, Admin); disaring di server, tidak ikut payload | QA-06 KPI uang |
| D-15 | **Hydration error (React #418)** di `/roles/new` dan `/roles/<id>`: `Badge` (`<div>`) di dalam `<p>`. Pola sama di detail customer (kontak Primary, cacat lama). | `<p>` → `<div>`; pindai seluruh `src`: tidak ada pola lain | Kontrol negatif: tanpa perbaikan uji merah tepat di 2 halaman itu |
| — | Label "Kunci jurnal sampai tanggal" tidak terhubung ke input | `htmlFor`/`id` | QA-03 |

Catatan (tidak diubah): label pada form kas masuk/keluar dan transfer belum terhubung ke input-nya (aksesibilitas;
uji memakai placeholder). Percobaan paksa yang ditolak (mis. replay "Batalkan invoice" oleh Operation) tercatat di log
sebagai error, yang berguna sebagai jejak keamanan.

### 15.2 Regresi akhir (build yang sama dengan commit)

| Uji | Hasil |
|---|---|
| Unit (Vitest) | 175/175 |
| Typecheck / lint / build | Lulus |
| Integrasi (`tests/integration`, MariaDB 12.3) | 25/25 skrip, 0 FAIL |
| E2E penuh (spec lama + `e2e/qa/`, DB uji bersih) | **71/71** (13 berkas spec; 0 dilewati) |
| Smoke 7 user × 44 halaman | 0 error HTTP; Admin & Management 44, Sales 34, Operation 35, Documentation 32, Finance 39 (sisanya dialihkan sesuai izin) |

Menjalankan: `bash "Claude outputs/rbac/qa-run.sh" yes [e2e/qa/<spec>]` (memulihkan `ffms_test` dari snapshot seed,
menyalakan `next start` di port 3000 dengan DB uji, menjalankan Playwright, lalu mematikan server).
