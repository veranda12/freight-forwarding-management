# DECISIONS.md — Architectural & Design Decisions

Keputusan desain yang diambil selama membangun Freight Forwarding Management System.
Format: **Keputusan** — _alasan_.

## Platform & Stack

- **Next.js 15 (bukan 16)** — `create-next-app` terbaru memasang Next 16 yang punya breaking changes. Spec meminta Next 15, jadi di-pin ke `^15.1.4` untuk prediktabilitas dan kompatibilitas penuh dengan ekosistem (Auth.js v5, shadcn/ui).
- **Tailwind CSS v3 (bukan v4)** — shadcn/ui paling stabil di Tailwind v3; menghindari kejutan konfigurasi `@theme` v4. Variabel warna pakai HSL ala shadcn.
- **Tanpa Docker** — permintaan user: database lokal dijalankan langsung. Tidak ada `docker-compose.yml`.
- ~~PostgreSQL lokal~~ — digantikan MariaDB (lihat bagian berikut). Default tetap memakai user khusus `ffms`.

## Database: MariaDB (sejak 2026-11-05, branch `feat/mariadb-migration`)

- **MariaDB, bukan PostgreSQL** — _klien butuh hosting murah; VPS di luar anggaran, dan hosting bersama umumnya hanya menyediakan MariaDB/MySQL._ Provider Prisma `mysql`. Target minimum **MariaDB 10.11** (versi umum di hosting); diuji di **12.3 LTS** (lokal) dan **10.11 LTS**. Jangan memakai fitur khusus 11.x/12.x.
- **Riwayat migrasi dimulai ulang** — 14 migrasi PostgreSQL diarsipkan di `prisma/migrations-postgresql-archive/` (SQL-nya khusus PG); `prisma/migrations/` dimulai dari satu baseline MariaDB. _Belum ada data produksi; perubahan data di migrasi lama sudah dibuat ulang oleh seed._
- **Isolasi transaksi READ COMMITTED untuk semua PrismaClient** (`src/lib/prisma-options.ts`) — _logika transaksi ditulis untuk semantik PostgreSQL. Di REPEATABLE READ (bawaan MariaDB) transaksi yang menunggu kunci lalu membaca ulang memakai snapshot lama: di 10.11 dua setoran pajak paralel bisa sama-sama lolos (setor ganda), di 12.3 transaksi yang kalah gagal dengan error 1020. Terbukti lewat uji kontrol negatif._ Setiap `new PrismaClient()` baru wajib memakai `PRISMA_CLIENT_OPTIONS`.
- **Kunci setor pajak = baris `Sequence` `LOCK:TAX:<jenis>` per masa** (pengganti `pg_advisory_xact_lock`) — _memakai `nextCounter` yang sudah ada; kunci baris ditahan sampai commit dan aman di connection pool (berbeda dengan `GET_LOCK` yang terikat koneksi)._
- **`nextCounter` mencoba ulang sekali saat P2002** — _upsert Prisma di MySQL = baca lalu tulis, sehingga dua transaksi yang membuat baris pertama sebuah key bisa bentrok; di MariaDB statement gagal tidak membatalkan transaksi, jadi percobaan kedua aman._
- **Kolom teks bebas = `@db.Text`** (alamat, catatan, deskripsi, token) — _`String` Prisma di MySQL menjadi `VARCHAR(191)`; kolom kode/nomor/nama tetap VARCHAR agar bisa di-index._
- **Collation `utf8mb4_unicode_ci`** — _pencarian dan unique tidak membedakan huruf besar/kecil (kode `ABC` dan `abc` dianggap sama); `mode: "insensitive"` Prisma tidak didukung di MySQL dan tidak diperlukan._
- **Raw SQL memakai backtick dan `CONVERT_TZ(…, '+00:00', '+07:00')`** — _Asia/Jakarta tanpa DST, jadi offset tetap tidak butuh tabel zona waktu (sering kosong di hosting)._
- **Lokal di Windows: `lower_case_table_names=2`** — _agar nama tabel tetap PascalCase seperti di hosting Linux (`=0`)._

## Domain / Akuntansi

- **Uang = Decimal(18,2)**, kurs & kuantitas = Decimal(18,6)/(18,3). Tidak pernah float.
- **Nilai GL disimpan dalam IDR**. Transaksi valas dikonversi dengan kurs pada tanggal dokumen; selisih kurs saat pelunasan diposting ke akun Laba/Rugi Selisih Kurs.
- **PPN keluaran 11%** otomatis pada baris invoice yang taxable. **PPh 23 2%** dipotong pada vendor bill untuk charge jasa (`isPph23`), mengurangi kas yang dibayar (utang PPh 23 dicatat).
- **Jurnal tidak pernah dihapus.** Pembatalan dokumen membuat **jurnal reversal** (balik debit/kredit) yang menunjuk jurnal asal.
- **Costing menyimpan estimated & actual (IDR)** per baris, plus detail valas (currency, rate, amountForeign) pada sisi actual. Profit job = Σ selling − Σ buying (actual).
- **Penomoran dokumen** via tabel `Sequence` dengan unique `(key, year, month)` di dalam transaksi DB → aman dari race condition. Format: `JOB/SEA-EXP/2026/10/0001`, `QUO/2026/10/0001`, `INV/2026/10/0001`, `BILL/...`, `PAY-R/...`, `PAY-P/...`, `BKG/...`, `JE/...`, `DN/`, `CN/`.

## Role Management (sejak 2026-11-06, menggantikan RBAC 6 role tetap)

- **Role kustom (tabel `AppRole`) berisi daftar kunci izin; tiap user satu role** — _admin perlu membuat/mengubah role tanpa mengubah kode._ Katalog izin satu-satunya di `src/lib/permissions.ts` (124 izin per grup menu → modul). Jenis: `view` (menu), `action` (tombol), `approve` (kirim/terima/batal/posting), `own` (maker-checker), `scope` (lihat semua data). Izin aksi apa pun menyiratkan `view` modulnya (`normalizePermissions`). Kunci tak dikenal diabaikan.
- **Admin = role sistem** (`isSystem`): selalu semua izin, tidak bisa diubah/dihapus; sistem selalu menyisakan minimal satu Admin aktif; user tidak bisa menonaktifkan dirinya sendiri.
- **Izin dibaca dari DB setiap request** (`getCurrentUser`, `react` `cache`); token login hanya menyimpan id — _perubahan role dan penonaktifan user langsung berlaku; middleware edge tidak bisa membaca DB, jadi middleware hanya cek login._ Halaman: `requirePerm` (redirect ke dashboard atau `/no-access`); server action/route: `assertPerm` (ForbiddenError berpesan jelas). Semua server action wajib memanggil `assertPerm` (kecuali login/logout).
- **Batas data** (`src/lib/data-scope.ts`): tanpa `<modul>.viewAll`, user hanya melihat data yang ia **Sales PIC atau pembuatnya** (`createdById`, kolom baru; data lama tanpa pembuat dinilai dari Sales PIC). Dokumen turunan ikut pemilik job/STT/customer. Diterapkan di daftar, detail (`findFirst` id + scope → 404), aksi berbasis id, pencarian, dashboard, laporan, Excel, PDF. **Akuntansi & master data tidak dibatasi** (tidak bermakna per orang).
- **Alur quotation sesuai bisnis**: Draft → **Diajukan** (Sales, `submit`) → Kirim (`send`, margin < 10% butuh `sendLowMargin`) atau Kembalikan + catatan (`return`) → Terima/Tolak (`decide`) → Convert (`convert`). Transisi status atomik (`updateMany` dengan status asal).
- **Maker-checker** (`assertNotOwn`): pembuat/pengaju/pengirim quotation tidak boleh mengirim/mengembalikan/memutuskannya, kecuali punya `quotations.decideOwn` (bawaan: tidak ada yang punya). Pembatalan invoice, kas, transfer, jurnal manual, setoran pajak, dan STT punya pasangan `*Own`; role awal Finance/Operation **memegangnya** agar perilaku lama tetap (bisa dicabut admin).
- Role awal: Sales (buat/ajukan, data sendiri), Operation (review/kirim/putuskan/convert, job, domestik), Documentation, Finance, Management (semua `view` + `viewAll`, tanpa aksi kecuali export/cetak). Seed demo punya **dua** user Operation (`ops@`, `ops2@`) karena maker-checker.
- Migrasi `20261106090000_role_management` aman untuk DB berisi data (buat role → petakan enum lama → hapus enum). Role awal di migrasi dibuat dari katalog saat itu (`Claude outputs/rbac/gen-migration.ts`, di luar git); `ensureDefaultRoles` (seed) hanya membuat role yang belum ada.

## Master & Seed

- Faker locale `id_ID` dengan **seed tetap (faker.seed(20261002))** → data demo deterministik, `prisma db seed` idempoten (truncate lalu isi ulang).
- Nomor kontainer digenerasi dengan **check digit ISO 6346** yang valid.
- Perusahaan pengguna: **PT Samudra Lintas Logistik** (Jakarta Utara).

## UI

- Bahasa Indonesia; istilah industri tetap Inggris (Job, Shipper, B/L, ETD...).
- Nama produk pakai placeholder **{NAMA_PRODUK}** terpusat di `src/config/product.ts`.
- Halaman tracking publik `/track/[number]` tanpa login & tanpa data harga.
