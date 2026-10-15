# 🚢 DEMO.md — Cara Demo ke Klien + Penjelasan Bisnis

Dokumen ini berisi 3 bagian:
1. **Penjelasan bisnis "untuk anak kecil"** — biar siapa pun paham sistem ini buat apa.
2. **Flow demo End-to-End** — langkah per langkah yang dipresentasikan ke calon klien (±15 menit).
3. **Test End-to-End otomatis (Playwright)** — robot yang "mendemokan" sendiri untuk membuktikan semua jalan.

---

## 1. 🧒 Penjelasan Bisnis (gaya cerita untuk anak kecil)

Bayangkan ada **Pak Budi** punya pabrik kaos di Cikarang. Dia mau **menjual kaosnya ke Amerika**. Tapi… Amerika itu jauh banget, harus naik **kapal besar** menyeberangi laut. Pak Budi bingung:
- Kapalnya sewa ke siapa?
- Surat-suratnya gimana?
- Barang numpuknya di mana?
- Bea cukai gimana?

Nah, di sinilah muncul **"Pak Pengatur Kiriman"** — namanya **Freight Forwarder**. Di sistem kita, perusahaannya bernama **PT Samudra Lintas Logistik**.

**Freight Forwarder itu seperti "panitia / event organizer" untuk barang.** Pak Budi tinggal bilang: *"Tolong kirimkan 1 kontainer kaos saya ke Los Angeles."* Lalu si Forwarder yang mengurus **semuanya**: sewa tempat di kapal, bikin surat, nganter pakai truk, urus bea cukai, sampai barang nyampai.

Supaya tidak berantakan, Pak Forwarder butuh **"buku pintar raksasa"** — itulah **aplikasi ini**. Isi buku pintarnya:

| Istilah | Analogi anak kecil |
|---|---|
| **Shipper** | Yang punya & mengirim barang (Pak Budi) |
| **Consignee** | Yang menerima barang di seberang sana |
| **Quotation** | Surat penawaran harga: *"Ongkos kirimnya segini ya."* |
| **Job / Shipment** | Satu "tugas pengiriman" dari awal sampai akhir |
| **Booking** | Memesan tempat di kapal (seperti pesan tiket) |
| **Container** | Kotak besi raksasa tempat barang (ada nomornya, unik) |
| **B/L (Bill of Lading)** | **Surat sakti**: bukti barang + tiket untuk mengambil barang |
| **Milestone / Tracking** | Lacak posisi barang (seperti melacak ojek online) |
| **Costing** | Hitung-hitungan: *modal berapa, jual berapa, untung berapa* |
| **Invoice** | **Tagihan** yang kita kirim ke Pak Budi |
| **Vendor Bill** | **Tagihan** dari pemilik kapal/truk ke kita |
| **Payment** | Uang masuk (dari customer) / uang keluar (bayar kapal) |
| **Jurnal / Accounting** | Buku catatan uang biar rapi & tidak ada yang hilang |
| **Dashboard** | Papan skor: hari ini untung berapa, barang jalan berapa |

**Kenapa ada "hak akses" (role)?** Karena di kantor ada banyak orang dengan tugas beda:
- **Sales** → tukang tawar-menawar harga (bikin Quotation).
- **Operation** → tukang urus barang & kapal (Job, Booking, Tracking).
- **Documentation** → tukang bikin surat (B/L, dll).
- **Finance** → tukang hitung uang (Invoice, bayar, pembukuan).
- **Management** → bos, cuma **lihat** laporan (tidak boleh mengubah).
- **Admin** → yang pegang kunci semua pintu.

Jadi Sales tidak bisa ngutak-atik uang, dan bos tidak sengaja menghapus data. Semua aman. 😊

**Alur besarnya seperti ini:**

```
  Pak Budi minta harga
          │
          ▼
   [1] QUOTATION  ──(disetujui, 1 klik)──►  [2] JOB dibuat otomatis
          (Sales)                                   (Operation)
                                                      │
                                   ┌──────────────────┼───────────────────┐
                                   ▼                   ▼                   ▼
                            [3] BOOKING         [4] MILESTONE        [5] DOKUMEN
                            (pesan kapal)       (lacak barang)       (B/L, SI, DO - PDF)
                                                      │
                                                      ▼
                                              [6] COSTING (untung/rugi)
                                                      │
                                      ┌───────────────┴───────────────┐
                                      ▼                               ▼
                               [7] INVOICE (AR)                [8] VENDOR BILL (AP)
                               tagih customer                  tagihan dari kapal
                                      │                               │
                                      ▼                               ▼
                               [9] PAYMENT masuk              PAYMENT keluar
                                      │                               │
                                      └───────────────┬───────────────┘
                                                      ▼
                                      [10] JURNAL OTOMATIS → LAPORAN KEUANGAN
                                      (Trial Balance, Laba-Rugi, Neraca) — selalu BALANCE
```

---

## 2. 🎬 Flow Demo End-to-End (±15 menit)

**Persiapan:** `npm run dev`, buka http://localhost:3000. Semua akun password **`demo123`**.

### Babak 1 — "Lihat gambaran besar" (Management) · 2 menit
1. Login `manager@demo.com`.
2. Tunjukkan **Dashboard**: kartu KPI (Shipment Aktif, Revenue bulan ini, Gross Profit, AR Overdue), grafik **volume per bulan**, **revenue vs cost 12 bulan**, **Top 10 Customer**.
3. Pesan ke klien: *"Pimpinan bisa lihat kesehatan bisnis dalam 5 detik."*

### Babak 2 — "Menawar harga" (Sales) · 2 menit
4. Logout, login `sales@demo.com`.
5. Masuk **Quotation** → buka satu quotation berstatus **Sent**.
6. Tunjukkan: rincian charge multi-currency (USD/IDR), **margin dihitung otomatis**, dan **flag approval** jika margin < 10%.

### Babak 3 — "Satu klik jadi pekerjaan" · 1 menit
7. Pada quotation yang **Accepted**, klik **Convert ke Job** → sistem membuat **Job baru** (nomor otomatis `JOB/…`), semua charge otomatis pindah ke Costing.

### Babak 4 — "Mengurus barang" (Operation) · 3 menit
8. Logout, login `ops@demo.com` → **Job / Shipment** → buka satu job.
9. Telusuri tab: **Overview, Parties, Containers, Milestones, Documents, Costing, Invoices**.
10. Klik **Ubah Status** (mis. ke *Departed*) → status berubah live.
11. Buka tab **Milestones** → centang satu milestone → timeline ter-update.

### Babak 5 — "Bikin surat sakti" (Dokumen PDF) · 1 menit
12. Di tab **Documents** → klik **House B/L** / **Shipping Instruction** / **Delivery Order** → PDF rapi berkop **PT Samudra Lintas Logistik** terbuka di tab baru.

### Babak 6 — "Lacak seperti ojek online" (Publik) · 1 menit
13. Buka menu **Tracking** → klik **Lihat** pada sebuah job → halaman publik `/track/<nomor>` terbuka **tanpa login** dan **tanpa data harga** — ini yang dibagikan ke customer.

### Babak 7 — "Urusan uang" (Finance) · 4 menit
14. Logout, login `finance@demo.com`.
15. **Costing** → tunjukkan profit & margin per job (merah jika margin < 10%).
16. Buka sebuah **Job** → tab Invoices → **Buat Invoice dari Job** → muncul **Invoice** (subtotal + **PPN 11%** otomatis).
17. Di invoice → **Catat Pembayaran** → isi nominal → **Simpan** → status jadi **Paid**, **jurnal otomatis** terbentuk.
18. (Opsional) Klik **Batalkan** pada invoice tanpa pembayaran → **jurnal reversal** dibuat (jurnal lama tidak dihapus).
19. Masuk **Accounting** → tunjukkan **Trial Balance (BALANCE ✓)**, **Laba Rugi**, **Neraca (BALANCE ✓)**, **Buku Besar** per akun, dan daftar **Jurnal**.

### Babak 8 — "Laporan & ekspor" · 1 menit
20. Masuk **Reporting** → profitability per mode, shipment per status, sales performance, **AR/AP Aging** → klik **Export Excel**.

**Penutup:** *"Dari penawaran harga sampai laporan keuangan, semua dalam satu sistem, real-time, dengan pembukuan yang selalu balance."*

---

## 3. 🤖 Test End-to-End Otomatis (Playwright)

Robot yang **mendemokan sendiri** aplikasi lewat browser sungguhan — untuk membuktikan semua babak di atas benar-benar jalan.

### Menjalankan
```bash
# pastikan DB sudah di-seed
npm run db:seed

# unit test (fungsi murni: RBAC, format, ISO 6346, enum)
npm run test

# jalankan E2E (otomatis build & start server, lalu klik UI)
npm run test:e2e

# lihat laporan HTML
npm run test:e2e:report
```

> Jika browser belum terpasang: `npx playwright install chromium` (sekali saja).

### Apa yang diuji (file `e2e/demo.spec.ts`)
| # | Skenario | Yang dibuktikan |
|---|---|---|
| 1 | Management buka Dashboard | KPI + grafik ter-render |
| 2 | **RBAC**: Sales | Menu Accounting tidak muncul; akses paksa `/accounting` dialihkan ke dashboard |
| 3 | Operation buka Job | Tab Costing tampil "Gross Profit"; endpoint **PDF** B/L mengembalikan file PDF (200) |
| 4 | Finance buka Accounting | **Trial Balance** & **Neraca** menampilkan **Balance ✓** |
| 5 | Finance alur uang | **Buat Invoice dari Job** → **Catat Pembayaran** → toast sukses |
| 6 | Tracking publik | Halaman `/track/...` terbuka **tanpa login** & **tanpa** kata Revenue/Profit/Margin |

### Tambahan uji CRUD & form manual (`e2e/crud.spec.ts`)
| # | Skenario | Yang dibuktikan |
|---|---|---|
| 7 | Admin buat **Vendor** baru | Form generik EntityForm → tersimpan & muncul di daftar |
| 8 | Admin buat **Commodity** baru | Create master → muncul di daftar |
| 9 | Sales buka **form Quotation** manual | Kontrol multi-charge + simpan ter-render |
| 10 | Operation buka **form Job** manual | Data shipment + routing + simpan ter-render |

### Hasil terakhir
```
Unit (Vitest):      18 passed  (rbac, format, enums, ISO 6346 check digit)
E2E  (Playwright):  10 passed  (6 demo flow + 4 CRUD/form)
```

✅ **Semua lulus** — aplikasi siap didemokan ke calon klien.
