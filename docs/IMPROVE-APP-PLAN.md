# IMPROVE-APP-PLAN — CargoFlow (FFMS)

**Mode:** AUDIT ONLY — tidak ada perubahan kode sampai user menyetujui prioritas. Fokus: UI/UX aplikasi operasional B2B (bukan marketing, bukan generic SaaS dashboard). Domain bisnis, schema, workflow TIDAK diubah kecuali ada masalah UX jelas.

**Prinsip pemandu (dari user):** utamakan hirarki informasi, efisiensi operasional, data density, tabel/form/filter/search, status visibility, contextual actions, navigasi, pencegahan error, keterbacaan, konsistensi. Hindari estetika SaaS generik, kartu/rounded/badge berlebihan, gradient, stat raksasa, whitespace berlebihan, animasi/dekorasi tak perlu.

**Tanggal:** 2026-10-05 · Platform: Web · Inspeksi: screenshot 10 layar kunci (dashboard, jobs list/detail, costing, invoices list/detail, accounting, quotation form, customers, reports).

## Status Fase

| Fase | Skill | Status | Catatan |
|---|---|---|---|
| 1 | jobs-to-be-done | done (audit) | Job re-anchor → CUSTOMER.md |
| 2 | ux-heuristics | done (audit) | Friksi: filter/search/density/navigasi → DESIGN.md |
| 3 | design-everyday-things | done (audit) | Pencegahan error di form & aksi destruktif → DESIGN.md |
| 4 | refactoring-ui | done (audit) | Hirarki visual, density, kurangi chrome SaaS → DESIGN.md |
| 5 | microinteractions | done (audit) | Feedback aksi, loading state navigasi → DESIGN.md |
| 6 | made-to-stick | deferred: ringan | Copy sebagian besar sudah konkret (Indonesia). Beberapa label disentuh di DESIGN. |
| 7 | influence-psychology | skipped: tidak ada surface upsell/paywall | Alat internal. |
| 8 | high-perf-browser | done (audit, ringan) | Perceived perf: navigasi tabel, server-side filter/pagination → DESIGN.md |
| 9 | steve-jobs-design-review | done (audit) | Verdict + cut/fix list → PRODUCT.md |

## Artefak
- `docs/CUSTOMER.md` — job statement + dimensi + alternatif.
- `docs/DESIGN.md` — **UX Audit Findings** (tabel prioritas, inti deliverable) + token/komponen + microinteraction + performance.
- `docs/EXPERIMENTS.md` — backlog perubahan dengan skor ICE + metrik.
- `docs/PRODUCT.md` — verdict review & cut/fix list.

## Key Decisions
- 2026-10-05: Scope = **audit saja, tanpa ubah kode** (pilihan user). Implementasi menunggu persetujuan prioritas.
- 2026-10-05: Fase 7 di-skip (tak ada paywall/upsell). Fase 6 ditunda (copy sudah konkret).

## Next Actions
- [x] 2026-10-06: **Batch P0 diimplementasikan** (D-01 filter, D-02 worklist dashboard, D-03 density, D-04 aksi kontekstual, D-05 error prevention; + D-11, D-17). Verifikasi hijau (typecheck/build/18 unit/10 E2E). Lihat EXPERIMENTS.md § Implemented.
- [x] 2026-10-06: **Batch P1 diimplementasikan** (D-06 status-first, D-07/D-08 density card, D-09 overview rapat, D-10 ⌘K, D-12 finance strip, D-13 accounting filter+subtotal, D-14 numeric align). Verifikasi hijau (typecheck/build/18 unit/10 E2E). Lihat EXPERIMENTS.md § Implemented P1.
- [x] 2026-10-06: **Batch P2 + perbaikan 404 selesai** — buat halaman `/rates` (Rate Management list+CRUD, dulu 404), 404 kustom (root + in-shell), skeleton loading 16 route, breadcrumb (job/invoice detail). Verifikasi hijau (typecheck/build/18 unit/12 E2E). Lihat EXPERIMENTS.md § Implemented P2.
- [ ] Hanya tersisa **server-side pagination/filter** (P-01) — opsional, perlu rework; client-side cukup untuk skala saat ini.
