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
- **PPN keluaran** = semua pendapatan non-reimburse × tarif setting (`AccountingSetting.ppnRate`, bawaan **1,1%**, diubah di menu Pajak; invoice menyimpan tarifnya sendiri). Baris reimburse (`asReceipt`) tanpa PPN dan masuk akun titipan **1350**, bukan pendapatan/beban. **PPN masukan, PPh 23, dan PPh 26 pada vendor bill diisi manual** sesuai tagihan vendor (sejak penyesuaian client SLG; lihat bagian di bawah).
- **Pembatalan dokumen = jurnal reversal** (balik debit/kredit) yang menunjuk jurnal asal. Pengecualian yang diminta client: **edit** invoice belum dibayar, bukti kas/bank, dan Jurnal Umum mengganti baris jurnal dengan **nomor tetap** (`replaceJournal`, cek kunci periode tanggal lama & baru, isi lama di Audit Log).
- **Costing menyimpan estimated & actual (IDR)** per baris, plus detail valas (currency, rate, amountForeign) pada sisi actual. Profit job = Σ selling − Σ buying (actual).
- **Penomoran dokumen** via tabel `Sequence` dengan unique `(key, year, month)` di dalam transaksi DB (`nextCounter`, retry P2002 untuk MariaDB) → aman dari race condition. Format: `JOB/SEA-EXP/2026/10/0001`, `QUO/2026/10/0001`, `BILL/...`, `BKG/...`, `JE/...` (jurnal sistem & pembalik), `DN/`, `CN/`; invoice `INV/yy/mm/nnn` (urutan **tahunan**, counter `month 0`); nomor bukti `SLG/BM|BK|KM|KK|JU|VC/yy/mm/nnn` (kode perusahaan `CompanySetting.docCode`; BM/BK bank, KM/KK kas, JU Jurnal Umum, VC voucher).

## Bukti kas/bank, voucher, dan pajak (penyesuaian client SLG, 2026-11-08)

- **Nomor bukti `SLG/BK/26/11/06/0258`** (kode perusahaan / jenis / tahun / bulan / tanggal / nomor urut 4 digit) untuk
  BM, BK, KM, KK, JU, dan VC. _Mengikuti contoh formulir client._ Nomor urut **berjalan setahun per jenis bukti**
  (`Sequence` dengan `month = 0`). Nomor lama (`SLG/BK/26/11/001`) tidak diubah.
- **Edit bukti kas dan Jurnal Umum**: tanggal boleh diubah di bulan yang sama selama periode belum dikunci. Segmen
  tanggal di nomor ikut tanggal baru, nomor urut tetap. Pindah bulan ditolak.
- **Pajak = baris sendiri, diketik Finance** di voucher job dan Jurnal Pengeluaran. PPN masukan di Debet (1400),
  PPh 23/26 dipotong di Kredit (2200/2250), kas/bank dikredit nilai bersih. _Client: "PPh dipisah per komponen
  pembayaran"; pajak tidak disebar ke baris biaya._ Voucher menyimpan baris pajaknya di `VoucherTaxLine`; Jurnal
  Pengeluaran langsung di jurnalnya. Total voucher = biaya + PPN − PPh = nilai yang dibayar.
- **Reimburse tidak pernah kena pajak**: pajak ditolak bila tidak ada biaya non-reimburse, dan PPN/PPh tidak boleh
  melebihi biaya non-reimburse.
- **Jurnal Penerimaan juga punya baris pajak, sisinya dibalik** (2026-11-09): PPN Keluaran di Kredit (2100), PPh 23 yang
  dipotong customer di Debet (1450 PPh 23 dibayar dimuka). Bank = penerimaan + PPN − PPh. _Andhika sempat memilih "sama
  persis dengan pengeluaran"; diubah sesudah contoh angka (jasa 10 jt + PPN 1,1 jt − PPh 200 rb: bank 9,1 jt vs 10,9 jt
  dan PPN tercatat sebagai PPN Masukan)._ Jenis pajak dibatasi per arah (`TAX_KINDS_BY_FLOW`); voucher biaya job tetap
  hanya jenis pengeluaran, sehingga enum `TaxRowKind` di database tidak berubah.
- **Rekap pajak** membaca baris pajak voucher, Jurnal Pengeluaran, dan Jurnal Penerimaan (PPN Keluaran) dari jurnalnya
  (pihak = keterangan baris, DPP tidak tercatat), sehingga daftar rekap sama dengan saldo akun pajak.
- **Vendor Bill per job**: PPN/PPh bill tidak disebar proporsional; tampil sebagai baris sendiri di job kepala bill.
- **Cetak (diperbarui 2026-11-09, template client baru)**: semua bukti uang masuk/keluar (BM/BK/KM/KK dari Jurnal
  Penerimaan/Pengeluaran, Catat Pembayaran, Bayar) dan semua voucher memakai template **RECEIPT VOUCHER (Voucher
  Penerimaan) / PAYMENT VOUCHER (Voucher Pengeluaran)**: kop logo + nama PT (alamat di bawahnya, karena belum ada kolom
  tagline), No. Voucher = nomor SLG (format RV-YYYY-MMDD-NNN dari contoh client ditolak), tanggal, baris rekening
  `BCA - 0881234567`, tabel Keterangan | Kode COA | Debit (Rp) | Kredit (Rp) | Total, dan tanda tangan Diajukan
  (Operasional) / Diketahui (Manager Ops) / Disetujui (Direktur) / Diterima (Finance) untuk keduanya. **Jurnal Umum
  tetap format SOP** (A5 lanskap) dengan kotak Doc. No / Revision / Effective Date (`ProofForm`; di Setting Perusahaan
  kini hanya baris JU, isian formulir lain tetap tersimpan tetapi tidak tercetak). Nilainya milik SLG, jadi tidak
  di-seed. Jurnal bernomor `JE/…` (transfer, setor pajak, aset, armada) dicetak dengan formulir Jurnal Umum.

## Tarif PPN invoice dari biaya transportasi (2026-11-25, keputusan tim pajak client)

- **Tarif dipilih per invoice, bukan per baris.** Ada baris non-reimburse dengan charge `isTransport` (trucking beserta
  extra distance, overweight, extended trucking; freight laut, udara, kereta) = tarif transportasi (`AccountingSetting.ppnRate`,
  1,1%). Tidak ada = tarif tanpa transportasi (`ppnRateNoTransport`, 11%). Reimburse tetap di luar DPP dan tidak memicu tarif.
- Client: extra distance, overweight, dan extended trucking selalu datang bersama trucking. Extended trucking tetap reimburse.
- Dihitung saat invoice dibuat dan **dihitung ulang setiap kali invoice belum lunas disusun ulang** (`rebuildInvoice`), mengikuti
  aturan "perhitungan berlaku untuk yang belum dibayar". Invoice yang sudah ada pembayaran tetap memakai tarif tersimpan.
- Penanda di Master Data, Charge Code, tombol "Invoice & Reimburse". Migrasi `20261125090000_ppn_by_transport` mengisi penanda
  dari kode (TRUCK, XDIST, OVWT, EXTTRUCK, OF, AF, LCL, LSS, DOMFRT) dan nama (truck, freight, overweight, extra distance, delivery fee).
- Usulan Excel `docs/Rate_Card-pajak.xlsx` (reinvoicing masuk DPP, dana talangan, PPN masukan tidak dikreditkan) **tidak dipakai**;
  tim pajak client hanya menetapkan aturan tarif di atas. PPh 23 tetap 2% dari jasa tanpa reimburse.

## Rebranding SentraHub dan identitas PT Sentra Logistik Global (2026-11-23)

- Nama aplikasi **SentraHub** (dulu CargoFlow), dari satu tempat `src/config/product.ts`. Nama PT pengguna **PT Sentra
  Logistik Global**; prefix nomor dokumen `SLG` tetap cocok.
- **Logo** = gambar ulang vektor dari kop surat client (sumbernya hanya ±70 px), satu sumber geometri
  `src/lib/brand-logo.ts`. Dipakai di web (`components/brand/logo-mark.tsx`: login, sidebar, tracking, 404), favicon
  (`app/icon.svg`, dibuat dari `logoSvg()`), dan semua cetakan (`lib/pdf/logo-mark.tsx` → `CompanyLogo`).
- Di cetakan, **logo unggahan di Pengaturan menang**. Tanpa unggahan, dipakai logo vektor, sehingga logo tetap ada
  walau folder `public/uploads` hilang saat deploy. Cetakan yang memakai logo: invoice, voucher
  penerimaan/pengeluaran, kop Jurnal Umum SOP, dokumen job (HBL/MBL/SI/DO/…), dan STT.
- Alamat kantor (Dock Desk Coworking Space, Pelindo Tower Lantai 4, …, Koja / Kota Adm. Jakarta Utara, DKI Jakarta
  14230) dan rekening **Bank Mandiri 103-00-1361596-4** a.n. PT Sentra Logistik Global ada di seed. DB yang sudah
  terpasang diperbarui migrasi `20261125090000_company_sentra`, hanya bila datanya masih data demo lama, supaya data
  yang sudah diisi tidak ditimpa. Rekening bawaan menjadi "Mandiri Utama" (CoA 1200 "Bank Mandiri").
- NPWP, telepon, email, dan website PT belum diketahui, jadi dikosongkan (baris kosong tidak tercetak); diisi admin di
  Pengaturan.
- Tagline **"International and Domestic Freight Forwarder"** di bawah nama PT pada semua cetakan, mengikuti kop surat
  client (`COMPANY_TAGLINE` di `src/config/product.ts`).
- Catatan client (Mbak Eka, 2026-11-23): **invoice** menampilkan tagline lalu alamat sesuai NPWP; **voucher**
  penerimaan/pengeluaran **tanpa alamat**. Dokumen job (HBL/MBL/SI/DO/…) dan STT tetap memuat alamat; kop Jurnal Umum
  memang tanpa alamat.
- Kolom teks kop di invoice, voucher, dokumen job, dan STT memakai `flex: 1`. Tanpa itu, alamat panjang tidak membungkus
  dan menabrak kotak judul di kanan (ketahuan saat cek visual dengan alamat client).

## Akrual akhir bulan otomatis saat closing (2026-11-20)

- Permintaan client: laba rugi bulanan tidak boleh "terlalu besar" di bulan invoice lalu "rugi semu" di bulan tagihan vendor datang.
- Saat Closing bulan, biaya buying **non-reimburse** dari job yang **sudah ditagih** (invoice aktif bertanggal ≤ akhir bulan) tapi belum dijurnal sampai akhir bulan dijurnal akrual: Dr beban (akun charge code, fallback 5900), Cr **2050 Hutang Belum Ditagih (Akrual)**, tanggal akhir bulan, sumber `ACCRUAL`, `sourceId` = periode.
- "Belum dijurnal" = tidak ada vendor bill aktif bertanggal ≤ akhir bulan, voucher belum dibayar ≤ akhir bulan, dan biaya armada belum dicatat ≤ akhir bulan. Bill bertanggal bulan berikutnya tetap diakrualkan.
- Pembalik otomatis tanggal 1 bulan berikutnya, sebagai jurnal biasa (`sourceId` = `YYYY-MM:REV`), bukan pembatalan, supaya akrual tidak tampil sebagai transaksi batal. Tagihan asli tetap diinput seperti biasa di tanggal realnya; selisih perkiraan vs tagihan jatuh di bulan tagihan.
- Akrual hanya aktif setelah **bulan mulai** diatur di halaman Tutup Buku (`CompanySetting.accrualStartPeriod`). Job yang pertama kali ditagih sebelum bulan mulai tidak ikut, supaya biaya lama tidak menumpuk di closing pertama. Kosong = akrual nonaktif.
- Job yang masih belum di-bill bulan berikutnya diakrualkan lagi di closing berikutnya (akrual lalu dibalik tiap bulan, netonya benar).
- Reimburse tidak diakrualkan (akun 1350, bukan laba rugi). PPN tidak diakrualkan.
- Baris biaya yang ikut akrual dicatat di `AccrualLine`. Membuka bulan untuk koreksi tetap boleh. Closing ulang tidak membuat atau menghitung ulang akrual (pembaliknya di bulan berikutnya yang mungkin sudah closing). Selama bulan dibuka, halaman Tutup Buku menampilkan **Pemeriksaan akrual**: biaya yang tercatat dua kali (ikut akrual dan juga punya bill/voucher bertanggal bulan itu) dan biaya yang sekarang memenuhi syarat tapi tidak ikut akrual. Penyesuaiannya lewat Jurnal Umum.
- Form Vendor Bill memberi peringatan bila tanggal bill jatuh di bulan yang biaya terpilihnya sudah diakrualkan.
- Halaman Tutup Buku menampilkan pratinjau akrual bulan berikutnya dan daftar periksa "biaya yang mungkin belum diinput": job yang ditagih di bulan itu tanpa biaya non-reimburse, atau dengan charge selling yang biasanya punya biaya vendor (pernah dipakai di buying job lain) tapi belum ada di buying. Daftar ini hanya pengingat.

## Role Operation bawaan mengikuti aturan SLG (2026-11-19)

- Role Management (branch `feat/slg-role-management-pg`, di-pull 19 Nov) memberi role bawaan Operation izin costing, laporan, rate card, charge code, rate, quotation, dan input biaya. Itu melanggar aturan client 5-6 Nov: Ops tidak boleh melihat nilai tagihan ke customer, dan hanya Finance yang menginput biaya.
- Izin itu dicabut dari bawaan (`DEFAULT_ROLES`) dan dari database lewat migrasi `20261123090000_operation_slg_access`. Hak Ops kembali sama dengan sebelum Role Management: job, container, clearance, B/L, milestone, booking, dokumen, master operasional.
- Hanya role bawaan Operation yang diubah. Super Admin tetap bisa memberi izin itu ke role mana pun lewat Role Management.
- Alur quotation maker-checker tetap ada untuk role yang diberi izinnya. Uji E2E-nya memakai role peninjau sementara.

## Rate card per kota: tab kota dan salin tarif (2026-11-18)

- Client bingung karena semua tarif masih "Semua kota", sehingga job Surabaya memakai harga Jakarta. Aturannya tetap: kota diambil dari pelabuhan job (impor POD, ekspor POL), tarif kota menggantikan tarif dasar yang setara.
- Saringan kota diganti tab kota dengan jumlah tarif aktif per kota. "Tarif dasar" = tarif tanpa kota.
- Tombol **Salin tarif ke kota** (`copyRateCardToCity`) menyalin tarif aktif dari tarif dasar atau satu kota ke kota lain dengan harga sama. Tarif setara (charge, dasar hitung, berlaku, tipe container, customer) yang sudah ada di kota tujuan dilewati, jadi salin ulang aman dan harga yang sudah diubah tidak tertimpa.
- Kota baru di luar daftar boleh diketik, tapi pelabuhannya harus ada di master Port dengan kolom Kota yang sama persis.

## Transaksi batal dan hak hapus (2026-11-17)

- **Buku Besar menyembunyikan transaksi batal**: jurnal yang dibalik beserta jurnal baliknya tidak tampil bila keduanya
  bertanggal sama (WIB), jadi saldo awal/berjalan/akhir tetap sama dengan Trial Balance. Pembalikan di tanggal lain tetap
  tampil. Centang "Tampilkan transaksi batal" (`?cancelled=1`) untuk audit. Jurnal reversal tetap dibuat seperti biasa.
- **Batalkan/hapus transaksi khusus Admin**: invoice, bill, voucher (semua jenis), pelunasan/pembayaran, Jurnal
  Penerimaan & Pengeluaran, transfer, setoran pajak, Jurnal Umum, dan Batalkan Job. Dicek di server action dan tombolnya
  disembunyikan untuk role lain (Cari Bukti: `entryActions`). Hapus baris biaya dan container di job tetap untuk
  Finance/Ops karena bagian dari input harian, bukan transaksi yang sudah terjurnal.
- **Catat Pembayaran invoice langsung membuka cetakan voucher penerimaan** (BM/KM), sama seperti Bayar bill.
- **Di Role Management (branch `feat/slg-role-management-pg`, 2026-11-18) "khusus Admin" = izin, bukan nama role.**
  _Cek `role === "ADMIN"` memblokir Super Admin dan mengabaikan Role Management._ Izin batal yang sudah ada
  (`invoices.cancel`, `vouchers.cancel`, `cashEntry.cancel`, `cashEntry.transferCancel`, `tax.cancel`,
  `manualJournal.cancel`, `jobs.cancel`) ditambah izin baru `bills.cancel`, `payments.cancel` (pelunasan invoice dan
  pembayaran vendor), `jobs.statusBack` (mundurkan status job), dan `closing.reopenMonth` (buka bulan closing); masing-masing
  batal punya pasangan `*Own` (maker-checker). Admin dan Super Admin memegang semuanya dari kode. Role bawaan Finance dan
  Operation **tidak** memegangnya (migrasi `20261122090000_admin_only_cancel` mencabut dari baris yang sudah ada); Super
  Admin bisa memberikannya ke role kustom. Edit bill jadi izin sendiri `bills.edit` (dulu ikut izin membuat bill).
  Batal STT (`domestic.cancel`) tidak termasuk keputusan client, jadi tetap.

## Voucher = pelunasan, nomor BK/BM/KK/KM (2026-11-17, menggantikan "dokumen pencatatan saja" di bawah)

- _Client: "voucher ini tujuannya untuk pelunasan dan pembayaran bill dan job", nomornya memakai kode BK, BM, KK, KM._
- **Voucher invoice/bill mencatat pelunasan saat disimpan** (`recordReceiptTx` / `recordVendorPaymentTx`), dan
  **nomor voucher = nomor bukti pembayarannya** (BM/KM untuk invoice, BK/KK untuk bill), jadi satu transaksi satu nomor.
  Hanya dokumen IDR yang belum lunas, nilai voucher ≤ sisa tagihan. Cetakan langsung terbuka sesudah simpan.
- **Batalkan voucher = batalkan pelunasannya** (khusus Admin, aturan sama dengan Batalkan Pelunasan: jurnal dibalik,
  ditolak bila sudah direkonsiliasi atau periodenya closing). Sebaliknya, Batalkan Pembayaran/Pelunasan dari dokumen
  ikut membatalkan vouchernya (`cancelVoucherOfPayment`). Baris dokumen dilepas supaya bisa divoucher ulang.
- **Voucher biaya job**: tetap terbit lalu dibayar; saat dibayar nomornya diganti nomor bukti BK/KK, VC hanya nomor
  sementara selama belum dibayar.
- Voucher VC lama tanpa pembayaran (versi 9 Nov) tetap bisa dibatalkan seperti dulu.

## Voucher dari invoice dan vendor bill (2026-11-09, direvisi hari yang sama; diganti 2026-11-17 di atas)

- **Istilah client**: *voucher job* = voucher dari Invoice / Vendor Bill (plus tab Biaya job); *voucher non-job* =
  Jurnal Penerimaan & Pengeluaran (alurnya tetap, langsung terjurnal). Tidak ada voucher berdiri sendiri (`VoucherKind`).
- **Voucher invoice/bill = dokumen pencatatan saja** (revisi; versi pertama mencatat pembayaran sekaligus): tanpa
  jurnal, tanpa pembayaran, tanpa status Lunas/Belum lunas, dan status invoice/bill tidak berubah. Pelunasan tetap lewat
  Catat Pembayaran / Bayar. _Client: "gak perlu ada status, tok hanya sebagai pencatatan saja"._ Jurnal kas di voucher
  akan mencatat uang dua kali bila dokumennya juga dibayar lewat Bayar, jadi voucher tidak memposting apa pun.
- **Tabel Kode COA otomatis** (`docVoucherRows`, satu fungsi untuk pratinjau form dan cetakan): invoice = Bank Debit,
  pendapatan per baris (akun charge; titipan 1350 untuk reimburse; 4900 bila kosong) dan PPN Keluaran Kredit; bill =
  biaya per baris dan PPN Masukan Debit, PPh 23/26 dan Bank Kredit.
- **Isi voucher = baris yang dicentang** (mis. per job); satu baris hanya di satu voucher aktif (unique `VoucherDocLine`,
  aman terhadap dua penyimpanan bersamaan). Pajak dokumen ikut **di voucher yang memuat baris pertama dokumen**, jadi
  Σ voucher = nilai dokumen.
- **Dibatasi**: dokumen IDR yang tidak dibatalkan (lunas atau belum), rekening IDR, periode tidak terkunci.
- **Batalkan dengan alasan** dari daftar Voucher: baris dokumen dilepas (`VoucherDocLine` dihapus) supaya bisa masuk
  voucher baru; nomor tidak dipakai ulang. Voucher invoice/bill versi pertama yang sudah mencatat pembayaran
  (`paymentId`) tidak bisa dibatalkan; koreksi lewat Jurnal Umum.
- **Voucher biaya job tetap** seperti sebelumnya (terbit lalu dibayar).
- **Menu "Buat Voucher"** di grup Finance sesudah Jurnal Penerimaan & Pengeluaran, dan tombol di halaman itu
  (permintaan client: buat voucher dari menu accounting).
- Baris invoice/bill tanpa job (data lama) **ikut job kepala dokumen** di form, kartu, daftar, dan cetakan.

## Import Excel master Customer, Vendor, Commodity (2026-11-09)

- **Di Role Management (2026-11-18) import mengikuti izin dan batas data seperti form**: customer butuh
  `customers.create` + `customers.edit`, vendor `vendors.edit`, commodity `commodities.edit` (`IMPORT_PERMS`). Customer
  baru tercatat sebagai buatan pengimpor (`createdById`), dan baris yang kodenya milik customer di luar batas data user
  **dilewati** ("di luar batas data Anda"), sama dengan form Edit Customer. _Tanpa ini Sales bisa menimpa customer Sales
  lain lewat kodenya._
- **Template dari kode** (`src/lib/master-import.ts`, satu spesifikasi kolom untuk template, pembacaan, dan petunjuk):
  sheet Data (header, kolom teks untuk NPWP/telepon/kode, dropdown Ya/Tidak dan Tipe vendor), Petunjuk, Contoh. Contoh
  sengaja di sheet terpisah supaya tidak ikut ter-import.
- **Kode terisi = update, kosong = baru** (keputusan Andhika). Saat update, sel kosong = nilai lama tetap. Commodity
  dikunci HS Code + Nama (yang sudah ada hanya bisa diubah kolom Aktif-nya). Kode baru CUST/VEND berurutan seperti form.
- **Sebanyak mungkin disimpan**: penghalang (wajib kosong, angka/Ya-Tidak/tipe salah, kode tidak ada, nama sudah ada atau
  ganda di file) dilewati dan dilaporkan; peringatan (email/NPWP, Sales PIC tidak dikenal) tetap disimpan.
- **Pratinjau lalu Simpan**; simpan membaca dan memvalidasi ulang file dalam satu transaksi (hasil pratinjau di browser
  tidak dipercaya). Bentrok unik dengan user lain = seluruh import gagal, tidak setengah masuk.
- **Route handler, bukan server action**, untuk upload: file sampai 2 MB tidak terbentur batas body server action (1 MB)
  tanpa mengubah konfigurasi global. Cek login, izin write entitas (sama dengan form Baru), dan origin.
- Batas: `.xlsx` saja, 2 MB, 1.000 baris per file. Satu entri audit log per import.

## Role Management (sejak 2026-11-06, menggantikan RBAC 6 role tetap)

- **Role kustom (tabel `AppRole`) berisi daftar kunci izin; tiap user satu role** — _admin perlu membuat/mengubah role tanpa mengubah kode._ Katalog izin satu-satunya di `src/lib/permissions.ts` (148 izin per grup menu → modul, per 2026-11-18). Jenis: `view` (menu), `action` (tombol), `approve` (kirim/terima/batal/posting), `own` (maker-checker), `scope` (lihat semua data). Izin aksi apa pun menyiratkan `view` modulnya (`normalizePermissions`). Kunci tak dikenal diabaikan.
- **Dua role sistem** (`isSystem`, tidak bisa diubah/dihapus; izinnya dihitung dari kode oleh `permissionsOfRole`, kolom `permissions` hanya catatan) — _keputusan Andhika 2026-11-08, di-merge dari `feat/slg-role-management-pg`:_
  - **Super Admin** = semua izin, satu-satunya pemegang **Role Management** (`roles.view`, `roles.manage`).
  - **Admin** = semua izin **kecuali** Role Management; tetap memegang User Management, setting, audit, dll.
  - `roles.*` tidak bisa diberikan ke role kustom (`normalizeCustomPermissions` membuangnya; editor tidak menampilkannya), jadi Management (semua `view`) pun tanpa Role Management.
  - `hasPerm` hanya membaca set izin (tanpa jalan pintas `isAdmin`), supaya batas Admin benar-benar ditegakkan.
- **Pengaman User Management** (di server, `src/lib/users.ts`): hanya Super Admin yang boleh memberi/mencabut role Super Admin dan mengubah/mereset/menonaktifkan akun Super Admin; sistem selalu menyisakan minimal satu **Super Admin** aktif; user tidak bisa menonaktifkan dirinya sendiri. UI menyembunyikan opsi/tombol yang pasti ditolak.
- **Migrasi `20261108100000_super_admin`**: membuat role Super Admin, membuang `roles.*` dari role lain, dan menjadikan **tepat satu** Admin lama Super Admin — Admin aktif yang paling lama dibuat (bila tidak ada yang aktif: Admin paling lama dibuat). Admin lain tetap Admin. Seed demo: `superadmin@demo.com`.
- **Izin dibaca dari DB setiap request** (`getCurrentUser`, `react` `cache`); token login hanya menyimpan id — _perubahan role dan penonaktifan user langsung berlaku; middleware edge tidak bisa membaca DB, jadi middleware hanya cek login._ Halaman: `requirePerm` (redirect ke dashboard atau `/no-access`); server action/route: `assertPerm` (ForbiddenError berpesan jelas). Semua server action wajib memanggil `assertPerm` (kecuali login/logout).
- **Batas data** (`src/lib/data-scope.ts`): tanpa `<modul>.viewAll`, user hanya melihat data yang ia **Sales PIC atau pembuatnya** (`createdById`, kolom baru; data lama tanpa pembuat dinilai dari Sales PIC). Dokumen turunan ikut pemilik job/STT/customer. Diterapkan di daftar, detail (`findFirst` id + scope → 404), aksi berbasis id, pencarian, dashboard, laporan, Excel, PDF. **Akuntansi & master data tidak dibatasi** (tidak bermakna per orang).
- **Alur quotation sesuai bisnis**: Draft → **Diajukan** (Sales, `submit`) → Kirim (`send`, margin < 10% butuh `sendLowMargin`) atau Kembalikan + catatan (`return`) → Terima/Tolak (`decide`) → Convert (`convert`). Transisi status atomik (`updateMany` dengan status asal).
- **Maker-checker** (`assertNotOwn`): pembuat/pengaju/pengirim quotation tidak boleh mengirim/mengembalikan/memutuskannya, kecuali punya `quotations.decideOwn` (bawaan: tidak ada yang punya). Pembatalan invoice, bill, voucher, pelunasan, kas, transfer, jurnal manual, setoran pajak, dan STT punya pasangan `*Own`. Sejak 2026-11-18 role awal Finance/Operation tidak memegang izin batal transaksi (lihat "Transaksi batal dan hak hapus"); `domestic.cancel(+Own)` Operation tetap.
- Role awal: Sales (buat/ajukan, data sendiri), Operation (review/kirim/putuskan/convert, job, domestik), Documentation, Finance, Management (semua `view` + `viewAll`, tanpa aksi kecuali export/cetak). Seed demo punya **dua** user Operation (`ops@`, `ops2@`) karena maker-checker.
- Migrasi `20261106090000_role_management` aman untuk DB berisi data (buat role → petakan enum lama → hapus enum). Role awal di migrasi dibuat dari katalog saat itu (`Claude outputs/rbac/gen-migration.ts`, di luar git); `ensureDefaultRoles` (seed) hanya membuat role yang belum ada.

## Penyesuaian client SLG (sejak 2026-11-07, branch `feat/mariadb-slg`)

Kebutuhan client dibangun rekan tim di `feat/slg-penyesuaian-client` (PostgreSQL, commit `3330c48`, sudah diuji client)
lalu di-**merge** ke branch MariaDB (bukan cherry-pick, supaya commit `part2` berikutnya cukup di-merge lagi).
`main` dan branch client tetap PostgreSQL.

- **Fitur**: Voucher pengeluaran biaya job (buat → bayar BK/KK → batal sebelum dibayar; biaya terkunci sejak voucher
  dibuat), Kasir All (semua baris jurnal kas/bank), builder invoice (satu job) dan bill (satu vendor, boleh beberapa
  job; `InvoiceLine.jobId`/`BillLine.jobId`), edit invoice/bukti kas/Jurnal Umum nomor tetap, kunci job (Closed, atau
  Delivered + invoice) dan tutup otomatis saat lunas, buka job, form B/L, tambah akun COA, tarif PPN, halaman
  `/costing/[id]` (pindahan tab Costing/Invoices di halaman job).
- **Hak akses** (keputusan pemilik): role bawaan tetap mengikuti alur Role Management — Operation tetap memegang alur
  quotation & charge/costing (berbeda dari `rbac.ts` client yang mencabutnya); `rbac.ts` client tidak dipakai. Izin baru:
  `vouchers.*` (+`cancelOwn`), `kasir.view`, `invoices.edit`, `cashEntry.edit`, `manualJournal.edit`, `jobs.bl`,
  `jobs.close`/`jobs.reopen` (bawaan: Admin saja, sama dengan client), `coa.create`, `taxes.ppnRate`. Ubah/hapus charge
  yang sudah masuk invoice juga butuh `invoices.edit`. Hak lihat/edit jurnal per sumber: `src/lib/journal-access.ts`.
- **Batas data**: `voucherScope`; invoice/bill terlihat oleh pemilik job **baris** mana pun (dokumen lintas job); builder
  dan action berbasis `lineIds` menolak baris di luar `jobScope` (`assertCostingLinesInScope`).
- **Migrasi** `20261107120000_slg_adjustments` (MariaDB, kompatibel 10.11): DDL + `jobId` baris lama dari kepala
  dokumen + akun 1350 + izin baru untuk role bawaan yang sudah tersimpan (role kustom tidak disentuh). Migrasi
  PostgreSQL client diarsipkan di `prisma/migrations-postgresql-archive/`.
- **Cacat client yang diperbaiki di MariaDB** (dilaporkan ke sesi PostgreSQL, `docs/` worktree `ffms-pg-check`):
  C-1 nomor invoice tahunan tanpa retry (P2002 saat paralel), C-2 invoice OVERDUE belum dibayar tidak bisa diedit,
  C-3 sumber VOUCHER tidak bisa difilter, C-4 DPP PPN masukan = PPN/11%, C-5 PPN invoice STT memakai aturan lama,
  C-6 invoice/bill tanpa `createdById`. Temuan yang **tidak** diubah (perlu keputusan client): invoice dibatasi satu
  job, voucher dibayar tanpa jalur pembalik, `editInvoiceCharges` tanpa `assertJobEditable`, tutup job otomatis tanpa
  `userId`.
- **Part2** (`feat/slg-penyesuaian-client-part2`, di-merge 2026-11-08): menu **Cari Bukti** (`/proofs`, satu kotak cari
  lintas jurnal/invoice/bill/payment/voucher/note/setoran pajak; nomor, job/B/L, pihak, keterangan, nominal format
  Indonesia), **Vendor Bill per job** (kelompok per job, bill lintas job dibagi proporsional, filter job/B/L/no. bill/
  tanggal/vendor/customer/status/jatuh tempo/mata uang, bawaan belum lunas), dan kunci periode saat membuat voucher.
  Porting: izin `proofs.view` (bawaan Finance & Sales, sama dengan client; Management lewat izin view), jenis bukti
  mengikuti izin modulnya (`PROOF_KIND_PERMS`), hasil mengikuti batas data modulnya (dikirim halaman sebagai `scopes`,
  sehingga `proof-search.ts` tetap murni dan ber-unit-test), tombol Cetak mengikuti izin cetak; `loadBillGroups` menerima
  `billScope`. Migrasi data `20261108090000_proof_search_permission`.
- **Super Admin** (`feat/slg-role-management-pg`, di-merge 2026-11-08): port Role Management ke PostgreSQL (`b850d4c`)
  di-merge `-s ours` karena isinya berasal dari branch ini; commit Super Admin sesudahnya di-merge biasa. Migrasi MariaDB
  `20261108100000_super_admin` dibuat dari katalog (padanan PostgreSQL diarsipkan). Aturan lengkap di bagian Role
  Management di atas.
- **D-17** (cacat builder invoice client, ditemukan dari log klien): radio `name="invoice-job"` bertabrakan dengan salinan
  HTML streaming yang belum di-hydrate → React error #90 saat memilih job. Grup radio dibungkus `<form>` sendiri.

## Master & Seed

- Faker locale `id_ID` dengan **seed tetap (faker.seed(20261002))** → data demo deterministik, `prisma db seed` idempoten (truncate lalu isi ulang).
- Nomor kontainer digenerasi dengan **check digit ISO 6346** yang valid.
- Perusahaan pengguna: **PT Sentra Logistik Global** (Jakarta Utara); lihat bagian rebranding SentraHub.

## UI

- Bahasa Indonesia; istilah industri tetap Inggris (Job, Shipper, B/L, ETD...).
- Nama produk pakai placeholder **{NAMA_PRODUK}** terpusat di `src/config/product.ts`.
- Halaman tracking publik `/track/[number]` tanpa login & tanpa data harga.

## Tata letak PDF invoice dan laporan container (permintaan client 2026-11-25)

- PDF invoice (ringkas dan detail) dibagi dua blok: **Reimbursement (As Per Receipt)** di atas dengan subtotal sendiri, lalu **Service Charges** di bawah dengan subtotal, PPN, baris "Reimbursement (above)", dan **TOTAL INVOICE** = jasa + PPN + reimburse. Huruf seksi berlanjut dari blok atas ke bawah. Baris excluded (red lane) ikut blok jasa. Logika di `invoiceBlocks()` (`src/lib/pdf/invoice-document.tsx`); tampilan invoice di layar tidak berubah.
- Reporting tab **Container per Bulan** (`src/lib/container-report.ts`): jumlah job, container per tipe, total container, dan TEU per bulan untuk satu tahun, bulan diklik untuk rincian job. Bulan ditentukan tanggal tiba (ATA, lalu ETA) untuk impor dan tanggal berangkat (ATD, lalu ETD) untuk ekspor; tanpa jadwal pakai tanggal job dibuka. Job batal tidak dihitung. Container tanpa tipe dihitung "Tanpa tipe" dengan TEU 0. Hanya job ekspor-impor; modul domestik tidak memakai container. Export Excel `type=containers&year=`.
- Gabung baris reimburse di cetakan (`mergeReceiptLines`): hanya baris dengan seksi, nama biaya, **unit**, dan B/L yang sama (client 26 Nov). LOLO lift on dan lift off beda vendor tetap satu baris; THC 20GP dan THC 40HC dicetak terpisah karena tarifnya beda. Berlaku untuk semua biaya reimburse, termasuk LOLO: lift on & lift off digabung per tipe container, LOLO 20GP dan 40HC terpisah (client 26 Nov). Unit diambil dari baris costing: rate card membuat estimasi per tipe container, dan form charge punya isian **Tipe container** (tampil untuk job dengan beberapa tipe). Buying bertipe hanya mengganti estimasi rate card tipe yang sama; buying tanpa tipe mengambil tipe estimasi hanya bila job cuma satu tipe container, selain itu unitnya kosong.
