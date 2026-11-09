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
- **Penomoran dokumen** via tabel `Sequence` dengan unique `(key, year, month)` di dalam transaksi DB → aman dari race condition. Format: `JOB/SEA-EXP/2026/10/0001`, `QUO/2026/10/0001`, `INV/2026/10/0001`, `BILL/...`, `PAY-R/...`, `PAY-P/...`, `BKG/...`, `JE/...`, `DN/`, `CN/`. Bukti kas/bank, Jurnal Umum, dan voucher memakai format client (lihat bagian di bawah).

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

## Voucher dari invoice dan vendor bill (2026-11-09, direvisi hari yang sama)

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
