# DECISIONS.md — Architectural & Design Decisions

Keputusan desain yang diambil selama membangun Freight Forwarding Management System.
Format: **Keputusan** — _alasan_.

## Platform & Stack

- **Next.js 15 (bukan 16)** — `create-next-app` terbaru memasang Next 16 yang punya breaking changes. Spec meminta Next 15, jadi di-pin ke `^15.1.4` untuk prediktabilitas dan kompatibilitas penuh dengan ekosistem (Auth.js v5, shadcn/ui).
- **Tailwind CSS v3 (bukan v4)** — shadcn/ui paling stabil di Tailwind v3; menghindari kejutan konfigurasi `@theme` v4. Variabel warna pakai HSL ala shadcn.
- **Tanpa Docker** — permintaan user: pakai PostgreSQL lokal (service `postgresql-x64-17` di port 5432) langsung. Tidak ada `docker-compose.yml`.
- **PostgreSQL lokal** — koneksi via `DATABASE_URL`. Default memakai user khusus `ffms` (dibuat manual sekali) agar tidak bergantung ke password superuser `postgres`.

## Domain / Akuntansi

- **Uang = Decimal(18,2)**, kurs & kuantitas = Decimal(18,6)/(18,3). Tidak pernah float.
- **Nilai GL disimpan dalam IDR**. Transaksi valas dikonversi dengan kurs pada tanggal dokumen; selisih kurs saat pelunasan diposting ke akun Laba/Rugi Selisih Kurs.
- **PPN keluaran 11%** otomatis pada baris invoice yang taxable. **PPh 23 2%** dipotong pada vendor bill untuk charge jasa (`isPph23`), mengurangi kas yang dibayar (utang PPh 23 dicatat).
- **Jurnal tidak pernah dihapus.** Pembatalan dokumen membuat **jurnal reversal** (balik debit/kredit) yang menunjuk jurnal asal.
- **Costing menyimpan estimated & actual (IDR)** per baris, plus detail valas (currency, rate, amountForeign) pada sisi actual. Profit job = Σ selling − Σ buying (actual).
- **Penomoran dokumen** via tabel `Sequence` dengan unique `(key, year, month)` di dalam transaksi DB → aman dari race condition. Format: `JOB/SEA-EXP/2026/10/0001`, `QUO/2026/10/0001`, `INV/2026/10/0001`, `BILL/...`, `PAY-R/...`, `PAY-P/...`, `BKG/...`, `JE/...`, `DN/`, `CN/`.

## Role Management (PostgreSQL sejak 2026-11-08, port dari branch MariaDB; menggantikan RBAC 6 role tetap)

- **Role kustom (tabel `AppRole`) berisi daftar kunci izin; tiap user satu role** — _admin perlu membuat/mengubah role tanpa mengubah kode._ Katalog izin satu-satunya di `src/lib/permissions.ts` (124 izin per grup menu → modul). Jenis: `view` (menu), `action` (tombol), `approve` (kirim/terima/batal/posting), `own` (maker-checker), `scope` (lihat semua data). Izin aksi apa pun menyiratkan `view` modulnya (`normalizePermissions`). Kunci tak dikenal diabaikan.
- **Dua role sistem** (`isSystem`, tidak bisa diubah/dihapus; izinnya dihitung dari kode oleh `permissionsOfRole`, kolom `permissions` hanya catatan) — _keputusan Andhika 2026-11-08:_
  - **Super Admin** = semua izin, satu-satunya pemegang **Role Management** (`roles.view`, `roles.manage`).
  - **Admin** = semua izin **kecuali** Role Management; tetap memegang User Management, setting, audit, dll.
  - `roles.*` tidak bisa diberikan ke role kustom (`normalizeCustomPermissions` membuangnya; editor tidak menampilkannya), jadi Management (semua `view`) pun tanpa Role Management.
  - `hasPerm` hanya membaca set izin (tanpa jalan pintas `isAdmin`), supaya batas Admin benar-benar ditegakkan.
- **Pengaman User Management** (di server, `src/lib/users.ts`): hanya Super Admin yang boleh memberi/mencabut role Super Admin dan mengubah/mereset/menonaktifkan akun Super Admin; sistem selalu menyisakan minimal satu **Super Admin** aktif; user tidak bisa menonaktifkan dirinya sendiri. UI menyembunyikan opsi/tombol yang pasti ditolak.
- **Migrasi `20261108100000_super_admin`**: membuat role Super Admin, membuang `roles.*` dari role lain, dan menjadikan **tepat satu** Admin lama Super Admin — Admin aktif yang paling lama dibuat (bila tidak ada yang aktif: Admin paling lama dibuat). Admin lain tetap Admin. Seed demo: `superadmin@demo.com`.
- **Izin dibaca dari DB setiap request** (`getCurrentUser`, `react` `cache`); token login hanya menyimpan id — _perubahan role dan penonaktifan user langsung berlaku; middleware edge tidak bisa membaca DB, jadi middleware hanya cek login._ Halaman: `requirePerm` (redirect ke dashboard atau `/no-access`); server action/route: `assertPerm` (ForbiddenError berpesan jelas). Semua server action wajib memanggil `assertPerm` (kecuali login/logout).
- **Batas data** (`src/lib/data-scope.ts`): tanpa `<modul>.viewAll`, user hanya melihat data yang ia **Sales PIC atau pembuatnya** (`createdById`, kolom baru; data lama tanpa pembuat dinilai dari Sales PIC). Dokumen turunan ikut pemilik job/STT/customer. Diterapkan di daftar, detail (`findFirst` id + scope → 404), aksi berbasis id, pencarian, dashboard, laporan, Excel, PDF. **Akuntansi & master data tidak dibatasi** (tidak bermakna per orang).
- **Alur quotation sesuai bisnis**: Draft → **Diajukan** (Sales, `submit`) → Kirim (`send`, margin < 10% butuh `sendLowMargin`) atau Kembalikan + catatan (`return`) → Terima/Tolak (`decide`) → Convert (`convert`). Transisi status atomik (`updateMany` dengan status asal).
- **Maker-checker** (`assertNotOwn`): pembuat/pengaju/pengirim quotation tidak boleh mengirim/mengembalikan/memutuskannya, kecuali punya `quotations.decideOwn` (bawaan: tidak ada yang punya). Pembatalan invoice, kas, transfer, jurnal manual, setoran pajak, dan STT punya pasangan `*Own`; role awal Finance/Operation **memegangnya** agar perilaku lama tetap (bisa dicabut admin).
- Role awal: Sales (buat/ajukan, data sendiri), Operation (review/kirim/putuskan/convert, job, domestik), Documentation, Finance, Management (semua `view` + `viewAll`, tanpa aksi kecuali export/cetak). Seed demo punya **dua** user Operation (`ops@`, `ops2@`) karena maker-checker.
- Migrasi PostgreSQL `20261108090000_role_management` aman untuk DB berisi data (buat role → petakan enum lama `role_<key>` → hapus enum), diuji di DB kosong dan DB berisi data lama (`prisma migrate diff` kosong). Role awal di migrasi dibuat dari katalog saat itu; `ensureDefaultRoles` (seed) hanya membuat role yang belum ada.
- **Bukan bagian port** (lapisan khusus MySQL): `prisma-options.ts` (isolasi READ COMMITTED sudah bawaan PostgreSQL), hilangnya `mode: "insensitive"`, raw SQL MySQL. Pencocokan teks di PostgreSQL tetap `mode: "insensitive"`, termasuk `route-match.ts` (D-08).

## Master & Seed

- Faker locale `id_ID` dengan **seed tetap (faker.seed(20261002))** → data demo deterministik, `prisma db seed` idempoten (truncate lalu isi ulang).
- Nomor kontainer digenerasi dengan **check digit ISO 6346** yang valid.
- Perusahaan pengguna: **PT Samudra Lintas Logistik** (Jakarta Utara).

## UI

- Bahasa Indonesia; istilah industri tetap Inggris (Job, Shipper, B/L, ETD...).
- Nama produk pakai placeholder **{NAMA_PRODUK}** terpusat di `src/config/product.ts`.
- Halaman tracking publik `/track/[number]` tanpa login & tanpa data harga.
