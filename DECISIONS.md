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

## Transaksi batal dan hak hapus (2026-11-17)

- **Buku Besar menyembunyikan transaksi batal**: jurnal yang dibalik beserta jurnal baliknya tidak tampil bila keduanya
  bertanggal sama (WIB), jadi saldo awal/berjalan/akhir tetap sama dengan Trial Balance. Pembalikan di tanggal lain tetap
  tampil. Centang "Tampilkan transaksi batal" (`?cancelled=1`) untuk audit. Jurnal reversal tetap dibuat seperti biasa.
- **Batalkan/hapus transaksi khusus Admin**: invoice, bill, voucher (semua jenis), pelunasan/pembayaran, Jurnal
  Penerimaan & Pengeluaran, transfer, setoran pajak, Jurnal Umum, dan Batalkan Job. Dicek di server action dan tombolnya
  disembunyikan untuk role lain (Cari Bukti: `entryActions`). Hapus baris biaya dan container di job tetap untuk
  Finance/Ops karena bagian dari input harian, bukan transaksi yang sudah terjurnal.
- **Catat Pembayaran invoice langsung membuka cetakan voucher penerimaan** (BM/KM), sama seperti Bayar bill.

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
