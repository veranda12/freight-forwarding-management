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

## RBAC

- Pembatasan ditegakkan **di server**: helper `requireRole()` dipanggil di setiap server action & route handler, bukan sekadar sembunyikan menu.
- Management = read-only semua modul (tidak boleh mutasi).

## Master & Seed

- Faker locale `id_ID` dengan **seed tetap (faker.seed(20261002))** → data demo deterministik, `prisma db seed` idempoten (truncate lalu isi ulang).
- Nomor kontainer digenerasi dengan **check digit ISO 6346** yang valid.
- Perusahaan pengguna: **PT Samudra Lintas Logistik** (Jakarta Utara).

## UI

- Bahasa Indonesia; istilah industri tetap Inggris (Job, Shipper, B/L, ETD...).
- Nama produk pakai placeholder **{NAMA_PRODUK}** terpusat di `src/config/product.ts`.
- Halaman tracking publik `/track/[number]` tanpa login & tanpa data harga.
