# EXPERIMENTS — CargoFlow (FFMS)

Backlog perubahan dari audit UI/UX. **Belum ada yang dijalankan** (mode audit). ICE: Impact/Confidence/Ease 1–10, Score = rata-rata. Setiap item punya metrik yang harus bergerak (karena belum ada analytics riil, metrik = ukuran proxy yang bisa diamati saat demo/uji internal).

## Experiment Backlog

| ID | Perubahan (dari temuan) | Impact | Conf | Ease | ICE | Metrik / cara ukur | Prioritas |
|---|---|---|---|---|---|---|---|
| X-01 | Filter status/mode/arah/periode di Job list + server-side (D-01, P-01) | 9 | 8 | 5 | 7.3 | Waktu menemukan "FCL Departed minggu ini" (stopwatch uji internal) turun; jumlah klik/scroll berkurang | **P0** |
| X-02 | Dashboard → work surface (antrian aksi role-aware) + strip KPI tipis (D-02, D-17) | 9 | 7 | 4 | 6.7 | Jumlah item "butuh aksi" yang terlihat tanpa navigasi; uji: staf menemukan 3 tugas prioritas < 10 dtk | **P0** |
| X-03 | Density tabel + sticky header + kolom ETA/vessel (D-03) | 8 | 9 | 7 | 8.0 | Baris terlihat per layar (target ≥25 @1440px) | **P0** |
| X-04 | Contextual row actions (kebab) di Job/Invoice list (D-04) | 7 | 8 | 6 | 7.0 | Langkah untuk "buat invoice dari job" (dari 4+ klik jadi ≤2) | **P0** |
| X-05 | Error prevention form: required marker + validasi inline + error per baris (D-05, D-14) | 7 | 8 | 6 | 7.0 | Submit gagal karena validasi (seharusnya ↓); error terlihat sebelum submit | **P0** |
| X-06 | Job detail: status+jadwal strip di atas, finansial sekunder/role-gated (D-06, D-09) | 7 | 7 | 6 | 6.7 | Uji: Ops menyebut status+ETD+next-milestone < 5 dtk | P1 |
| X-07 | Lepas wrapper Card dari tabel (flush) + rapatkan spacing global (D-07, D-08) | 6 | 8 | 7 | 7.0 | Density naik; screenshot grayscale tetap jelas | P1 |
| X-08 | Role-gated kolom Revenue/Margin di Job list (D-11) | 6 | 8 | 8 | 7.3 | Ops/Docs tidak melihat kolom komersial | P1 |
| X-09 | Global ⌘K/Ctrl+K fokus search + hint (D-10) | 5 | 8 | 8 | 7.0 | Waktu mulai pencarian (keyboard-only) | P1 |
| X-10 | Finance surfaces: tabel rapat + strip stat (D-12); Accounting date filter + subtotal (D-13) | 6 | 7 | 5 | 6.0 | Density; filter periode berfungsi | P1 |
| X-11 | Skeleton loading list + indikasi navigasi baris (Microinteraction, P-02) | 5 | 7 | 6 | 6.0 | Persepsi "responsif" saat koneksi lambat (throttle test) | P1 |
| X-12 | Dot+teks status di tabel padat; breadcrumb; page-size selector (D-15, D-16, D-18) | 4 | 7 | 7 | 6.0 | Konsistensi; navigasi deep page | P2 |

## Implemented — Batch P0 (2026-10-06)

Tanpa mengubah domain/workflow. Semua merujuk temuan audit.

| ID | Yang dikerjakan | Temuan | Before → After |
|---|---|---|---|
| X-01 | **Filter bar** Status/Mode/Arah di Job list + reset; facet juga di Invoices (Status) | D-01 | Hanya free-text → filter faceted (client-side; server-side tetap P1/P-01) |
| X-02 | **Dashboard jadi work surface**: strip KPI tipis (bukan 8 kartu raksasa) + panel **Butuh Aksi** role-aware (Berangkat ≤3h, Cut-off CY ≤2h, B/L belum terbit, AR overdue, AP ≤7h); chart jadi "Analitik" sekunder | D-02, D-17 | KPI card besar → strip ringkas + antrian aksi langsung actionable |
| X-03 | **Density tabel global**: cell `px-3 py-1.5`, header `h-9` uppercase, **sticky header**, kontainer scroll `max-h`, **page-size** 25/50/100 (default 25). Kolom **ETA + Vessel/Flight** di Job list | D-03 | ~15 baris longgar → ~25+ baris rapat, header menempel |
| X-04 | **Aksi kontekstual** (kebab) per baris Job (Buka, House B/L/AWB PDF, Tracking) & Invoice (Buka, Catat pembayaran) | D-04 | Tak ada aksi per baris → menu kontekstual |
| X-05 | **Pencegahan error form**: `EntityForm` penanda wajib `*` + **validasi inline** (error di bawah field, submit tervalidasi) pada 5 master | D-05 | Error hanya toast setelah submit → ditahan sebelum submit, pesan per field |
| X-08 | **Role-gate kolom Revenue/Margin** di Job list (Ops/Docs tidak melihat) | D-11 | Data komersial bocor ke semua role → hanya Finance/Sales/Management/Admin |

## Implemented — Batch P1 (2026-10-06)

| ID | Yang dikerjakan | Temuan | Before → After |
|---|---|---|---|
| X-06 | **Job detail status-first**: strip Status/Rute/ETD(+H-ETD)/ETA/ATD-ATA/Milestone-berikutnya di atas; finansial jadi strip sekunder **role-gated**; overview grid 3 kolom lebih rapat | D-06, D-09 | Tile uang mendominasi → status operasional dulu |
| X-07b | **Density global**: card padding p-5→p-4, radius xl→lg (kurang "bubbly"), header spacing rapat | D-07, D-08 | Whitespace & chrome SaaS berkurang |
| X-09 | **⌘K / Ctrl+K** fokus global search + hint `⌘K` di input | D-10 | Tanpa shortcut → keyboard-first |
| X-10a | **Finance strip** (`StatStrip`) ganti StatCard raksasa di Invoices/Bills/Payments/Costing | D-12 | Stat raksasa → strip ringkas |
| X-10b | **Accounting**: filter "Per tanggal" (as-of) utk TB/Neraca/L-R + **subtotal per tipe akun** | D-13 | Tanpa periode/subtotal → ada |
| X-14 | **Numerik rata kanan** (tabular-nums) di baris charge form Quotation | D-14 | Rata kiri sulit dibaca → rata kanan |

## Implemented — Batch P2 + perbaikan 404 (2026-10-06)

| ID | Yang dikerjakan | Temuan | Before → After |
|---|---|---|---|
| FIX | **Halaman `/rates` (Rate Management) dibuat** — list + filter Mode + CRUD (create/edit via `rateSchema`) | bug nav (bukan di audit) | Klik "Rate Management" → **404** → halaman penuh + 123 rate |
| 404 | **404 kustom**: root `not-found.tsx` (branded, link Dashboard/Cari Job) + `(app)/not-found.tsx` (dalam shell utk `notFound()` detail) | back-of-the-fence (PRODUCT.md) | Next default jelek → 404 rapi ber-brand |
| X-11 | **Skeleton loading** (`loading.tsx`) utk 16 route berat (dashboard/list/detail) via `ListSkeleton`/`DashboardSkeleton`/`DetailSkeleton` | microinteraction/perf | Layar kosong saat fetch → skeleton |
| D-16 | **Breadcrumb** di job detail & invoice detail | D-16 | Hanya "Kembali" → jejak navigasi |

Catatan: **D-15 (dot+teks status) sengaja tidak diubah** — badge status sudah jelas & accessible; mengganti ke dot berisiko menurunkan keterbacaan (temuan audit sendiri bersifat "consider").

## Sisa (butuh rework / tak esensial)
- **Server-side pagination/filter** (P-01) — perlu rework data-flow DataTable + query params; client-side cukup untuk skala demo (ratusan baris). Rekomendasi: kerjakan saat data membesar.

## Aturan main
- Tidak ada perubahan UI yang dikirim tanpa temuan P1–P3 di belakangnya (semua X-xx merujuk D-xx/P-xx).
- Setiap item yang jadi diimplementasi dicatat hasilnya di sini (before/after) + metrik.
