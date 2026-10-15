# DESIGN — CargoFlow (FFMS) · UI/UX Audit

Audit UI/UX aplikasi operasional B2B. Semua temuan **usulan (proposed)** — belum diimplementasikan. Severity 0–4 (4=katastrofik, 0=kosmetik). Prioritas = severity × frekuensi pemakaian oleh staf harian. Diurutkan P0 (sekarang) → P2 (nanti).

Bukti = screenshot layar yang diinspeksi (dashboard, jobs list/detail, costing, invoices, accounting, quotation form, customers, reports).

> **UPDATE 2026-10-06 — Batch P0 DITERAPKAN** (D-01, D-02, D-03, D-04, D-05; plus D-11 & D-17 yang menyertai). Status baris P0 di bawah = **implemented**. Verifikasi: typecheck 0, build 0, 18 unit + 10 E2E hijau. Detail di EXPERIMENTS.md § Implemented.

## UX Audit Findings

### P0 — Berdampak tinggi, sering dipakai (kerjakan dulu)

| ID | Layar | Temuan | Kategori | Sev | Usulan Perbaikan | Status |
|---|---|---|---|---|---|---|
| D-01 | Job list | Tidak ada **filter status/mode/arah/periode** — hanya free-text search. Staf menyaring "FCL Departed minggu ini" secara manual lewat 21 halaman. | ux-heuristics (efisiensi, fleksibilitas) | 4 | Tambah **filter bar**: segmented/chips Status, Mode, Arah + date range ETD; terapkan **server-side** (query params) agar pagination benar. | proposed |
| D-02 | Dashboard | Halaman utama = **8 KPI card raksasa** (laporan eksekutif), bukan **worklist operasional**. Tidak ada antrian "butuh aksi". | jobs-to-be-done / hirarki informasi | 4 | Ubah jadi **work surface role-aware**: strip KPI tipis (1 baris, angka kecil) + panel **antrian aksi**: Ops → cut-off hari ini / ETD ≤ 3 hari; Docs → B/L belum terbit; Finance → AR overdue teratas. | proposed |
| D-03 | Job list | **Kepadatan rendah**: padding baris besar, ±15 baris/layar, tak ada sticky header. Operasional butuh lebih banyak baris sekilas. | data density | 3 | Row height kompak (py-1.5), **sticky header**, opsi "Compact" density, tampilkan ETA + vessel/flight. Target ≥25 baris/layar di 1440px. | proposed |
| D-04 | Job list / semua tabel | **Tidak ada contextual actions** per baris (buka, generate B/L, buat invoice). Baris klik tanpa affordance jelas. | contextual actions | 3 | Kolom aksi trailing (kebab menu) dgn aksi sesuai status & role; perjelas baris dapat diklik (hover + cursor). | proposed |
| D-05 | Form (Quotation/Job/master) | **Pencegahan error lemah**: tak ada penanda wajib, validasi hanya via toast setelah submit, tak ada error inline per field/baris. | design-everyday-things (gulf of execution) | 3 | Penanda `*` wajib, **validasi inline** on-blur, submit disabled sampai valid, pesan error what/why/how di bawah field & di baris charge. | proposed |

### P1 — Berdampak sedang

| ID | Layar | Temuan | Kategori | Sev | Usulan Perbaikan | Status |
|---|---|---|---|---|---|---|
| D-06 | Job detail | **3 tile uang** (Revenue/Cost/Profit) mendominasi atas; status operasional & jadwal (ETD/ETA/ATD/ATA, next milestone, days-to-ETD) justru lebih penting untuk Ops/Docs. | hirarki informasi | 3 | Header **status+jadwal strip** dulu (status, rute, ETD/ETA, milestone berikutnya, sisa hari); tile finansial jadi sekunder / role-gated (Finance). | proposed |
| D-07 | Global (semua halaman data) | **Chrome SaaS berlebihan**: tabel dibungkus `Card` (rounded-xl + padding), menambah jarak & mengurangi density; kartu & rounded di mana-mana. | refactoring-ui | 3 | Tabel **flush** ke kontainer (border tipis, tanpa card padding), radius lebih kecil utk surface data, hapus wrapper card yang tak perlu. | proposed |
| D-08 | Global | **Spacing longgar** (space-y-6, p-5/6, gap-4) → whitespace berlebihan utk alat operasional. | spacing / density | 2 | Skala lebih rapat utk surface operasional: section space-y-4, card p-4, grid gap-3; header halaman lebih ringkas. | proposed |
| D-09 | Job detail Overview | Grid definisi 2 kolom berjarak lebar → banyak "-" & ruang kosong; tile "Rute - → -" tampil besar walau kosong. | data density | 2 | Definisi 3–4 kolom rapat; rute inline di header (buang tile rute); sembunyikan/ringkas grup kosong. | proposed |
| D-10 | Global | **Pencarian tanpa shortcut** keyboard (tak ada ⌘K/Ctrl+K) — efisiensi power-user. | efisiensi operasional | 2 | Tambah Ctrl/⌘+K fokus global search + hint "⌘K" di kolom search. | proposed |
| D-11 | Job list | **Revenue & Margin tampil ke semua role** (termasuk Ops/Docs) — data komersial sensitif. | status visibility / RBAC UI | 2 | Kolom Revenue/Margin **role-gated** (Finance/Sales/Management); Ops/Docs lihat kolom operasional (ETA, cut-off). | proposed |
| D-12 | Invoice/Bill/Payment detail & list | Finance surface juga card-heavy & stat besar (StatCard). Density tagihan rendah. | data density | 2 | Terapkan pola tabel rapat + ringkas header; stat jadi strip tipis. | proposed |
| D-13 | Accounting | Trial Balance/GL tanpa **filter tanggal (as-of/period)** & tanpa subtotal per tipe akun; row besar. | workflow clarity | 2 | Tambah date/period filter, subtotal per tipe (Aset/Liabilitas/…), row rapat. | proposed |
| D-14 | Form Quotation | Input numerik (qty/buying/selling) **rata kiri tanpa format ribuan**; sulit dibaca & rawan salah. | keterbacaan / error prevention | 2 | Rata kanan numerik, format ribuan on-blur, lebar kolom proporsional. | proposed |

### P2 — Polish / kosmetik

| ID | Layar | Temuan | Kategori | Sev | Usulan Perbaikan | Status |
|---|---|---|---|---|---|---|
| D-15 | Global | **Badge/pill status di mana-mana** (flag user: hindari pill berlebihan). | konsistensi visual | 1 | Di tabel padat, pertimbangkan **dot warna + teks** daripada pill penuh; sisakan pill utk header detail. | proposed |
| D-16 | Navigasi | Tak ada **breadcrumb** di halaman dalam; hanya tombol "Kembali". | navigasi | 1 | Breadcrumb ringkas (Modul › Daftar › Nomor). | proposed |
| D-17 | Dashboard | **Angka statistik oversized** (text-2xl) + ikon dekoratif di tiap card. | refactoring-ui (anti oversized stat) | 2 | Perkecil nilai (text-lg), rapatkan, kurangi ikon dekoratif. (Tergabung dgn D-02.) | proposed |
| D-18 | Tabel panjang | Pagination 15/hal tetap; tak ada pilihan page-size & tak ada total info "butuh aksi". | efisiensi | 1 | Pilihan page-size (15/50/100), server-side. | proposed |

## Trunk Test (per layar kunci)
- **Jobs list:** "Apa layar ini?" ✓ judul jelas. "Opsi saya?" ✗ tak ada filter — **gagal** (lihat D-01).
- **Job detail:** "Di mana saya & status?" ✓ nomor+badge. "Langkah berikutnya?" ✗ tak ada next-action/milestone di muka — **lemah** (D-06).
- **Dashboard:** "Apa yang harus saya kerjakan?" ✗ tidak terjawab (KPI saja) — **gagal** (D-02).

## Microinteraction Inventory (ringkas)

| Interaksi | Trigger/Rules/Feedback/Loops | Temuan | Usulan | Status |
|---|---|---|---|---|
| Klik baris tabel → navigasi | klik / navigate / **tak ada loading** / — | Tak ada indikasi saat halaman detail dimuat (bisa terasa "mati" di koneksi lambat). | Tambah row pressed state + top progress / skeleton detail. | proposed |
| Simpan form | submit / validasi server / spinner tombol + toast / redirect | **Baik** (spinner + toast sudah ada). Kurang: error inline. | Lihat D-05. | ok/partial |
| Ubah status job | pilih menu / server / toast + refresh | Baik. | — | ok |
| Empty/loading state tabel | — | Ada EmptyState; **tak ada skeleton loading** saat fetch awal. | Tambah skeleton rows utk list berat. | proposed |

## Performance (perceived) — ringan

| ID | Area | Temuan | Target | Usulan | Status |
|---|---|---|---|---|---|
| P-01 | Jobs/Invoices list | Pagination & filter **client-side** atas data penuh (300+ job diambil sekaligus). Terasa berat & tak scalable. | INP < 200ms, data awal lebih kecil | Pindah ke **server-side pagination + filter** (query params). | proposed |
| P-02 | Navigasi antar halaman | Tanpa skeleton saat transisi RSC. | LCP terasa < 2.5s | Skeleton/loading.tsx per route berat. | proposed |

## Tokens (usulan — belum diterapkan)
- **Density:** perkenalkan skala operasional: row py-1.5, cell px-3; section gap 16px; card padding 16px.
- **Radius:** surface data radius-md (bukan xl); pertahankan radius utk dialog/komponen kecil.
- **Stat:** nilai KPI text-lg/`font-semibold` (bukan text-2xl); hilangkan ikon dekoratif di strip.
- **Warna:** pertahankan palet (grayscale hierarchy sudah oke); status pakai dot+teks di tabel padat.

## Components (keputusan)
| Komponen | Keputusan | Status |
|---|---|---|
| DataTable | Tambah slot filter bar + kolom aksi + sticky header + density; dukung server-side. | proposed |
| StatCard | Varian "strip" tipis utk operasional; kurangi oversize. | proposed |
| Page/Table wrapper | Opsi tabel tanpa Card (flush). | proposed |
| Form field | Tambah required marker + error inline helper. | proposed |
