# CargoFlow — Freight Forwarding Management System

Sistem manajemen freight forwarding (Sea FCL/LCL, Air, Land, Customs Clearance) untuk PT Samudra Lintas Logistik — dibangun dengan **Next.js 15, Prisma, MariaDB, Tailwind + shadcn/ui, Auth.js v5**. Data demo realistis via seed deterministik.

> Nama produk dapat diganti dari satu file: `src/config/product.ts`.

> Database dipindah dari PostgreSQL ke **MariaDB** (November 2026) agar bisa di-host di hosting bersama. Migrasi
> PostgreSQL lama diarsipkan di `prisma/migrations-postgresql-archive/`. Detail keputusan di `DECISIONS.md`.

## 1. Prasyarat

- Node.js 20+
- **MariaDB 10.11 atau lebih baru** (diuji di 12.3 LTS dan 10.11 LTS), InnoDB, `utf8mb4`, tanpa Docker

## 2. Instalasi

```bash
npm install
npx prisma generate   # npm 11 tidak menjalankan skrip postinstall Prisma secara otomatis
```

### Siapkan database

Buat database `ffms` (+ `ffms_test` untuk uji integrasi) dan user `ffms`/`ffms123` (jalankan sekali sebagai root,
sesuaikan port):

```bash
mariadb -u root -p -h 127.0.0.1 -P 3306 < scripts/setup-db.sql
```

Buat `.env` (tidak ikut git):

```
DATABASE_URL="mysql://ffms:ffms123@127.0.0.1:3306/ffms"
AUTH_SECRET="<string acak, mis. hasil: openssl rand -base64 32>"
```

### Migrasi + seed

```bash
npx prisma migrate deploy   # terapkan migrasi yang ada (baseline MariaDB)
npx prisma db seed          # isi data demo ke database kosong
npm run dev
```

> `npx prisma db seed` bisa diulang: seed **mengosongkan semua tabel aplikasi** lalu mengisi ulang data demo yang sama
> persis. Jangan dijalankan di database yang berisi data sungguhan.

### Hosting (syarat minimum)

- Node.js 20+ yang bisa menjalankan aplikasi persisten (mis. cPanel "Setup Node.js App" / CloudLinux). Hosting yang
  hanya mendukung PHP **tidak bisa** menjalankan aplikasi ini.
- MariaDB ≥ 10.11 dengan InnoDB, `utf8mb4`, `sql_mode` berisi `STRICT_TRANS_TABLES`, `lower_case_table_names=0`
  (bawaan Linux). Database & user dibuat lewat panel hosting; `scripts/setup-db.sql` hanya untuk lokal.
- Build (`npm run build`) dikerjakan di mesin lokal/CI, bukan di hosting (butuh RAM besar).
- `binaryTargets` Prisma (`schema.prisma`) disesuaikan dengan OS hosting saat hosting sudah dipilih.

Buka http://localhost:3000

> Catatan: jika `npx prisma` tidak dikenal di shell Anda, gunakan `node node_modules/prisma/build/index.js <perintah>`.

## 3. Akun Demo

Password semua akun: **`demo123`**

| Role | Email | Akses |
|---|---|---|
| Admin | admin@demo.com | Semua modul + user management + setting + audit |
| Sales | sales@demo.com | Customer, rate, quotation |
| Operation | ops@demo.com | Job, booking, container, tracking, dokumen |
| Documentation | docs@demo.com | Dokumen B/L/AWB/SI/DO, tracking |
| Finance | finance@demo.com | Costing, invoice, bill, payment, accounting, laporan |
| Management | manager@demo.com | Read-only semua modul + dashboard & laporan |

RBAC ditegakkan di server (`requireCan`/`assertCan`) — bukan sekadar menyembunyikan menu.

## 4. Skenario Demo (±15 menit)

1. **Login sebagai Management** (`manager@demo.com`) → Dashboard: KPI (shipment aktif, revenue/profit bulan ini, AR overdue), grafik volume per mode, revenue vs cost 12 bulan, top 10 customer. _(±2 mnt)_
2. **Login sebagai Sales** (`sales@demo.com`) → **Quotation**: buka satu quotation berstatus *Sent* → tunjukkan rincian charge multi-currency, margin otomatis, flag approval bila margin <10%. Klik **Kirim/Terima**. _(±2 mnt)_
3. Pada quotation *Accepted*, klik **Convert ke Job** → sistem membuat Job baru (nomor otomatis `JOB/…`), seluruh charge terbawa ke Costing. _(±1 mnt)_
4. **Login sebagai Operation** (`ops@demo.com`) → **Job / Shipment**: buka sebuah job → tab **Overview, Parties, Containers, Milestones, Documents, Costing, Invoices**. Ubah **Status** job dan centang **Milestone** (lihat timeline update). _(±3 mnt)_
5. Di tab **Documents**, generate **House B/L / SI / Arrival Notice / DO** (PDF dengan kop perusahaan). _(±1 mnt)_
6. **Tracking publik**: buka menu Tracking → "Lihat" pada sebuah job → halaman `/track/<nomor>` tanpa login, menampilkan milestone tanpa data harga. _(±1 mnt)_
7. **Login sebagai Finance** (`finance@demo.com`):
   - **Costing**: profitability per job (margin diberi warna; merah bila <10%).
   - **Invoice (AR)**: buka invoice → subtotal, PPN 11%, jurnal otomatis, alokasi pembayaran.
   - **Vendor Bill (AP)**: PPh 23 2% otomatis pada jasa.
   - **Receipt & Payment**: penerimaan/pembayaran dengan alokasi.
   - **Accounting**: **Trial Balance (balance ✓)**, **Laba Rugi**, **Neraca**, **Jurnal**. _(±4 mnt)_
8. **Reporting**: profitability per mode, shipment per status, sales performance, **AR/AP Aging** + **Export Excel**. _(±1 mnt)_

## 5. Modul

Master Data (Customer, Vendor, Overseas Agent, Port & Airport, Currency & Kurs, Charge Code, Aturan Berat, Container Type, Commodity, Pajak, COA) · **Ekspor-Impor** (Rate, Quotation, Job, Booking, Dokumentasi PDF, Tracking publik) · **Domestik** (STT antar kota, Cek Tarif, Tarif Domestik) · Finance (Costing, AR Invoice, AP Bill, Debit/Credit Note, Payment, Accounting, Laporan) · Dashboard · Sistem (User, Audit Log, Setting).

## 6. Prinsip Teknis

- Uang = `Decimal(18,2)`, kurs = `Decimal(18,6)` — tidak pernah float.
- Timezone `Asia/Jakarta`; format Rupiah & tanggal locale Indonesia.
- Penomoran dokumen via tabel `Sequence` (aman dari race), di dalam transaksi DB.
- Semua transaksi DB memakai isolasi **READ COMMITTED** (`src/lib/prisma-options.ts`), bukan bawaan MariaDB
  (REPEATABLE READ).
- Pencarian & unique tidak membedakan huruf besar/kecil (collation `utf8mb4_unicode_ci`).
- Jurnal selalu seimbang; pembatalan via **reversal** (jurnal tidak dihapus).
- Seed deterministik (`faker.seed`), nomor kontainer ISO 6346 valid, Trial Balance balance.

Lihat `PLAN.md` (rencana) dan `DECISIONS.md` (keputusan desain) untuk detail.

## 7. Script

```bash
npm run dev          # jalankan dev server
npm run build        # production build
npm run typecheck    # tsc --noEmit
npm run db:seed      # kosongkan semua tabel lalu isi ulang data demo (deterministik)
npm run db:studio    # Prisma Studio
npm run test         # unit test (Vitest)
npm run test:e2e     # end-to-end test (Playwright)
```

## 8. Testing

- **Unit (Vitest)** — `npm run test`: RBAC, format mata uang/tanggal, enum, check digit ISO 6346, dan perhitungan berat kena biaya (28 test).
- **Integrasi** — skrip `tests/integration/*.ts` dijalankan dengan `tsx` terhadap database **uji** (salinan, mis.
  `ffms_test`), bukan database demo: `DATABASE_URL=mysql://ffms:ffms123@127.0.0.1:3306/ffms_test node node_modules/tsx/dist/cli.mjs tests/integration/verify-mariadb.ts`.
  `verify-mariadb.ts` menguji risiko khusus MariaDB (teks panjang, pencarian, penomoran & setor pajak paralel, zona
  waktu, presisi Decimal, utf8mb4). Laporan uji perpindahan database: `docs/qa/mariadb-migration-report.md`.
- **E2E (Playwright)** — `npm run test:e2e` (sekali pasang browser: `npx playwright install chromium`): 17 skenario (termasuk alur Domestik & Aturan Berat di `e2e/domestic.spec.ts`) menelusuri UI nyata (dashboard, RBAC, Job+PDF, Accounting balance, buat Invoice→bayar, tracking publik, CRUD Vendor/Commodity, form Quotation & Job). Detail & flow demo ada di `DEMO.md`.

## 9. CRUD & Form Manual

- **CRUD master** (tambah/edit + validasi Zod + audit): Customer, Vendor, Overseas Agent, Commodity, Container Type, Pajak.
- **Form create manual**: Quotation (multi-charge, preview margin live) dan Job/Shipment (routing sea/air adaptif). Job juga bisa dibuat via **Convert dari Quotation**.
- **Invoice manual**: buat dari Job → catat pembayaran → batalkan (reversal jurnal).

## 10. Domestik & Aturan Berat

Dua lini bisnis dipisah: **Ekspor-Impor** (Job, arah Export/Import) dan **Domestik** (STT antar kota) — menu, data, dan penomoran sendiri. Finance (invoice, pembayaran, jurnal) tetap satu buku.

- **Cek Tarif** (`/domestic/check`): isi dimensi, berat, kota tujuan → bandingkan harga & lead time darat/laut/udara, lalu "Buat STT".
- **STT** (`/domestic`): Surat Tanda Terima per pengiriman — koli, perhitungan berat, status perjalanan, bukti terima (POD), cetak PDF, buat invoice (jurnal otomatis ke akun 4500 Pendapatan Kargo Domestik), lacak publik di `/track/<nomor STT>`.
- **Tarif Domestik** (`/domestic/tariffs`): harga jual per kg per rute & mode, minimum tagih, lead time.
- **Aturan Berat** (`/weight-rules`): berat kena biaya = max(berat aktual, CBM × 1.000.000 ÷ divisor), lalu berat minimum, volume minimum (CBM), pembulatan, dan toleransi pembulatan (mis. sisa ≤ 0,3 kg dibulatkan ke bawah) — semuanya bisa diatur per mode untuk Ekspor-Impor (Air/LCL/Land, dipakai otomatis di form Job) dan Domestik (Darat/Laut/Udara).

Seed domestik bersifat idempoten: `npx tsx prisma/seed-domestic.ts` (juga jalan otomatis di akhir `prisma db seed`). Status PPN charge code `DOMFRT` diset kena PPN 11% — sesuaikan di menu Charge Code dengan konsultan pajak Anda (jasa pengurusan transportasi bisa memakai PPN besaran tertentu).
