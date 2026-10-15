# PRODUCT — CargoFlow (FFMS)

## Design Review (cold walkthrough) — Verdict

**One Thing aplikasi ini harus kuasai:** *membuat staf forwarding tahu dalam hitungan detik shipment/tagihan mana yang butuh aksi, lalu mengerjakannya tanpa berpindah-pindah.*

**Langkah ke nilai inti (hari kerja normal):** Login → Dashboard (KPI, bukan tugas) → Job/Shipment → **scroll/cari manual** tanpa filter → buka job → cari aksi di tab. **Terlalu banyak langkah pencarian manual** untuk pekerjaan yang berulang tiap hari.

**Verdict: BELUM "insanely great" — fungsional & rapi, tapi beroperasi seperti dashboard laporan, bukan alat kerja.** Fungsionalitas lengkap dan benar (akuntansi balance, PDF, RBAC, tracking). Yang kurang: **kecepatan operasional** — worklist, filter, density, aksi kontekstual. Ini soal UX, bukan fitur baru.

## Cut / Fix List (ranked)

| # | Item | Disposisi | Alasan |
|---|---|---|---|
| 1 | Dashboard 8 KPI card raksasa | **Kecilkan → strip + antrian aksi** | Bukan tugas; makan ruang; "oversized stats" yang user minta dihindari |
| 2 | Tanpa filter di daftar | **Tambah (P0)** | Blocker efisiensi harian |
| 3 | Kepadatan rendah + card-wrapped tables | **Rapatkan / lepas card** | Data density adalah prioritas eksplisit |
| 4 | Tile uang mendominasi job detail | **Turunkan prioritas / role-gate** | Ops butuh status, bukan uang |
| 5 | Ikon dekoratif di stat card | **Hapus** | Dekorasi tanpa fungsi |
| 6 | Validasi form hanya toast | **Tambah inline + required** | Pencegahan error |
| — | Fitur fungsional (akuntansi, PDF, tracking, CRUD) | **Pertahankan apa adanya** | Sudah benar & lengkap; jangan di-redesign |

## Outcome Roadmap

| Outcome / masalah | Job dilayani | Prioritas | Status |
|---|---|---|---|
| Staf menemukan shipment/tagihan yang butuh aksi dalam detik (filter + worklist + density) | Fungsional + emosional | P0 | proposed (audit) |
| Kerjakan langkah berikutnya tanpa berpindah (aksi kontekstual, status di muka) | Fungsional | P0/P1 | proposed |
| Kurangi "berat"/latensi daftar (server-side filter/pagination, skeleton) | Fungsional + emosional | P1 | proposed |
| Tampil sebagai sistem operasional serius, bukan SaaS generik (density, kurangi chrome) | Sosial | P1 | proposed |
| Pencegahan error di entri data (form) | Fungsional | P0/P1 | proposed |

## Back-of-the-fence (dicek)
- Empty states: ada (baik). Error 404/not-found: Next default (bisa dipercantik, P2). Login: rapi. Public tracking: rapi, tanpa harga (baik). **Tidak ada temuan kritis di "pagar belakang".**
