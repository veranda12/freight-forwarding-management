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
| Super Admin | superadmin@demo.com | Semua modul + **Role Management** + User Management + setting + audit (role sistem) |
| Admin | admin@demo.com | Semua modul + User Management + setting + audit, **tanpa** Role Management (role sistem) |
| Sales | sales@demo.com | Buat & **ajukan** quotation, customer, rate — hanya data miliknya sendiri |
| Operation | ops@demo.com, ops2@demo.com | Review/kirim/kembalikan, terima/tolak, convert quotation; job, booking, container, tracking, dokumen, domestik |
| Documentation | docs@demo.com | Dokumen B/L/AWB/SI/DO, tracking |
| Finance | finance@demo.com | Costing, invoice, bill, payment, accounting, laporan |
| Management | manager@demo.com | Read-only semua modul + dashboard & laporan |

Hak akses diatur di menu **Sistem → Role Management** (khusus **Super Admin**): Super Admin membuat/mengubah role dengan daftar centang izin per
menu → tombol/aksi → persetujuan → "boleh dokumen sendiri" (maker-checker) → "lihat semua data" (batas data). Izin
dibaca dari database setiap request, jadi perubahan role dan penonaktifan user langsung berlaku tanpa login ulang, dan
ditegakkan di server (`requirePerm`/`assertPerm`), bukan sekadar menyembunyikan tombol. Katalog izin:
`src/lib/permissions.ts`. Ada dua user Operation karena pengirim quotation tidak boleh menerima/menolak quotation
kirimannya sendiri.

## 4. Skenario Demo (±15 menit)

1. **Login sebagai Management** (`manager@demo.com`) → Dashboard: KPI (shipment aktif, revenue/profit bulan ini, AR overdue), grafik volume per mode, revenue vs cost 12 bulan, top 10 customer. _(±2 mnt)_
2. **Login sebagai Sales** (`sales@demo.com`) → **Quotation**: buka quotation *Draft* → tunjukkan rincian charge multi-currency, margin otomatis, flag approval bila margin <10% → klik **Ajukan** (Sales tidak punya tombol Kirim/Terima/Convert). _(±2 mnt)_
3. **Login sebagai Operation** (`ops@demo.com`) → buka quotation *Diajukan* → **Kirim** (atau **Kembalikan** dengan catatan revisi). Lalu **login sebagai `ops2@demo.com`** (pengirim tidak boleh memutuskan kirimannya sendiri) → **Terima** → **Convert ke Job** → sistem membuat Job baru (nomor otomatis `JOB/…`, POL/POD dari rute quotation), seluruh charge terbawa ke Costing. _(±2 mnt)_
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

- **Unit (Vitest)** — `npm run test`: katalog izin & role awal (termasuk Super Admin vs Admin), format mata uang/tanggal, enum, check digit ISO 6346, perhitungan berat kena biaya, dll.
- **Integrasi** — skrip `tests/integration/*.ts` dijalankan dengan `tsx` terhadap database **uji** (bukan demo `ffms` atau
  `ffms_pgcheck`; skrip yang menulis data menolak keduanya), mis.
  `DATABASE_URL=postgresql://…/ffms_part2 node node_modules/tsx/dist/cli.mjs tests/integration/verify-super-admin.ts`.
- **E2E (Playwright)** — `npm run test:e2e` (sekali pasang browser: `npx playwright install chromium`): alur Domestik & Aturan Berat (`e2e/domestic.spec.ts`), alur quotation & maker-checker (`e2e/quotation-flow.spec.ts`), Role Management (`e2e/role-management.spec.ts`), Super Admin vs Admin (`e2e/super-admin.spec.ts`), dan suite QA `e2e/qa/` (alur per role, keamanan & replay server action, anomali, matriks izin) menelusuri UI nyata. Suite QA butuh `DATABASE_URL` database uji yang sama dengan server. Detail & flow demo ada di `DEMO.md`.

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
