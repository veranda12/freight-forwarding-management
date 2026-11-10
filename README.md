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
   - **Vendor Bill (AP)**: PPN/PPh diisi sesuai tagihan vendor; menu Vendor Bill per job menampilkan pajak bill sebagai baris sendiri.
   - **Voucher dari invoice / vendor bill**: dari detail dokumen (atau menu **Buat Voucher**) centang baris (mis. per job) → tabel Kode COA / Debit / Kredit terisi otomatis → simpan. Voucher hanya catatan: tanpa jurnal, status invoice/bill tidak berubah (pelunasan tetap lewat Catat Pembayaran / Bayar). Bisa dibatalkan dari daftar Voucher. Form Buat Voucher punya tab Invoice, Vendor Bill, dan Biaya job.
   - **Voucher biaya job**, **Jurnal Pengeluaran**, dan **Jurnal Penerimaan**: tambah **baris pajak**. Pengeluaran: PPN Masukan di Debet, PPh 23/26 di Kredit. Penerimaan: PPN Keluaran di Kredit, PPh 23 dipotong customer di Debet. Biaya reimburse tidak dikenai pajak.
   - **Cetak**: bukti kas/bank dan voucher memakai template Receipt / Payment Voucher (nomor `SLG/BK/26/11/06/0001`); Jurnal Umum memakai formulir SOP.
   - **Receipt & Payment**: penerimaan/pembayaran dengan alokasi.
   - **Accounting**: **Trial Balance (balance ✓)**, **Laba Rugi**, **Neraca**, **Jurnal**. _(±4 mnt)_
8. **Reporting**: profitability per mode, shipment per status, sales performance, **AR/AP Aging** + **Export Excel**. _(±1 mnt)_

## 5. Modul

Master Data (Customer, Vendor, Overseas Agent, Port & Airport, Currency & Kurs, Charge Code, Aturan Berat, Container Type, Commodity, Pajak, COA) · **Ekspor-Impor** (Rate, Quotation, Job, Booking, Dokumentasi PDF, Tracking publik) · **Domestik** (STT antar kota, Cek Tarif, Tarif Domestik) · Finance (Costing, AR Invoice, AP Bill, Debit/Credit Note, Payment, Accounting, Laporan) · Dashboard · Sistem (User, Audit Log, Setting).

**Import Excel** di daftar Customer, Vendor, dan Commodity: tombol *Import Excel* → *Unduh template* → isi sheet Data → *Periksa* (pratinjau per baris) → *Simpan*. Kolom Kode kosong = data baru, terisi = memperbarui data itu (sel kosong tidak mengubah apa pun). Maks. 1.000 baris / 2 MB per file (.xlsx).

**Export Excel** di daftar Invoice dan Vendor Bill: file berisi sheet *Ringkasan* (satu baris per dokumen, baris TOTAL tanpa dokumen Cancelled) dan *Rincian* (satu baris per item). Nilai dalam IDR seperti pembukuan; dokumen valas punya kolom Mata Uang, Kurs, dan Nilai Valas.
- Invoice: tombol *Export Excel* → pilih periode tanggal invoice (bawaan bulan berjalan) dan status → *Unduh*. Boleh untuk yang bisa membuka daftar Invoice (Finance, Sales).
- Vendor Bill: tombol *Export Excel* memakai filter yang sedang aktif di halaman (termasuk bawaan "Belum lunas"), semua halaman. Bill lintas job diekspor utuh beserta semua barisnya. Hanya Finance.
- Maks. 5.000 dokumen per file; lebih dari itu diminta mempersempit filter.

## 6. Prinsip Teknis

- Uang = `Decimal(18,2)`, kurs = `Decimal(18,6)` — tidak pernah float.
- Timezone `Asia/Jakarta`; format Rupiah & tanggal locale Indonesia.
- Penomoran dokumen via tabel `Sequence` (aman dari race), di dalam transaksi DB. Bukti kas/bank, Jurnal Umum, dan voucher: `SLG/BK/26/11/06/0001`, nomor urut tahunan per jenis bukti.
- Kotak Doc. No / Revision / Effective Date pada cetakan bukti diisi di **Setting → Formulir bukti (SOP)**.
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

- **Unit (Vitest)** — `npm run test`: RBAC, format mata uang/tanggal, enum, check digit ISO 6346, dan perhitungan berat kena biaya (28 test).
- **E2E (Playwright)** — `npm run test:e2e`: 14 skenario (termasuk alur Domestik & Aturan Berat di `e2e/domestic.spec.ts`) menelusuri UI nyata (dashboard, RBAC, Job+PDF, Accounting balance, buat Invoice→bayar, tracking publik, CRUD Vendor/Commodity, form Quotation & Job). Detail & flow demo ada di `DEMO.md`.

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
