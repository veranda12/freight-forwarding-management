# CargoFlow — Freight Forwarding Management System

Sistem manajemen freight forwarding (Sea FCL/LCL, Air, Land, Customs Clearance) untuk PT Samudra Lintas Logistik — dibangun dengan **Next.js 15, Prisma, PostgreSQL, Tailwind + shadcn/ui, Auth.js v5**. Data demo realistis via seed deterministik.

> Nama produk dapat diganti dari satu file: `src/config/product.ts`.

## 1. Prasyarat

- Node.js 20+
- PostgreSQL 16/17 berjalan lokal di `localhost:5432` (tanpa Docker)

## 2. Instalasi

```bash
npm install
```

### Siapkan database

Buat user & database khusus (jalankan sekali — sesuaikan path psql Anda):

```bash
"C:\Program Files\PostgreSQL\17\bin\psql" -U postgres -h localhost -c "CREATE USER ffms WITH PASSWORD 'ffms123'; CREATE DATABASE ffms OWNER ffms;"
```

`.env` sudah berisi `DATABASE_URL="postgresql://ffms:ffms123@localhost:5432/ffms?schema=public"`.
Jika memakai kredensial lain, cukup ubah `DATABASE_URL`.

### Migrasi + seed

```bash
npx prisma migrate dev --name init
npx prisma db seed
npm run dev
```

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

Master Data (Customer, Vendor, Overseas Agent, Port & Airport, Currency & Kurs, Charge Code, Container Type, Commodity, Pajak, COA) · Sales (Rate, Quotation) · Operasional (Job, Booking, Dokumentasi PDF, Tracking publik) · Finance (Costing, AR Invoice, AP Bill, Debit/Credit Note, Payment, Accounting, Laporan) · Dashboard · Sistem (User, Audit Log, Setting).

## 6. Prinsip Teknis

- Uang = `Decimal(18,2)`, kurs = `Decimal(18,6)` — tidak pernah float.
- Timezone `Asia/Jakarta`; format Rupiah & tanggal locale Indonesia.
- Penomoran dokumen via tabel `Sequence` (aman dari race), di dalam transaksi DB.
- Jurnal selalu seimbang; pembatalan via **reversal** (jurnal tidak dihapus).
- Seed deterministik (`faker.seed`), nomor kontainer ISO 6346 valid, Trial Balance balance.

Lihat `PLAN.md` (rencana) dan `DECISIONS.md` (keputusan desain) untuk detail.

## 7. Script

```bash
npm run dev          # jalankan dev server
npm run build        # production build
npm run typecheck    # tsc --noEmit
npm run db:seed      # ulang seed (idempoten)
npm run db:studio    # Prisma Studio
npm run test         # unit test (Vitest)
npm run test:e2e     # end-to-end test (Playwright)
```

## 8. Testing

- **Unit (Vitest)** — `npm run test`: RBAC, format mata uang/tanggal, enum, dan validasi check digit ISO 6346 (18 test).
- **E2E (Playwright)** — `npm run test:e2e`: 10 skenario menelusuri UI nyata (dashboard, RBAC, Job+PDF, Accounting balance, buat Invoice→bayar, tracking publik, CRUD Vendor/Commodity, form Quotation & Job). Detail & flow demo ada di `DEMO.md`.

## 9. CRUD & Form Manual

- **CRUD master** (tambah/edit + validasi Zod + audit): Customer, Vendor, Overseas Agent, Commodity, Container Type, Pajak.
- **Form create manual**: Quotation (multi-charge, preview margin live) dan Job/Shipment (routing sea/air adaptif). Job juga bisa dibuat via **Convert dari Quotation**.
- **Invoice manual**: buat dari Job → catat pembayaran → batalkan (reversal jurnal).
