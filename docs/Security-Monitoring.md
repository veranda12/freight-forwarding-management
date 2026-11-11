# Security Monitoring & Login Activity

Fitur pencatatan keamanan CargoFlow: login berhasil/gagal, logout, perangkat baru, login mencurigakan, rate limit login,
akses ditolak, indikasi SQL injection/XSS, dan perubahan konfigurasi keamanan. Dashboard di menu **Sistem > Security**
(khusus Admin; Management tidak ikut, walau biasanya bisa membaca semua halaman).

## Komponen

| Bagian | Lokasi |
| --- | --- |
| Pencatat event terpusat | `src/lib/security/events.ts` (`recordSecurityEvent`) |
| Alur login (rate limit, perangkat, mencurigakan) | `src/lib/security/login-monitor.ts`, dipanggil dari `authorize()` di `src/auth.ts` |
| Logout | `events.signOut` di `src/auth.ts` (form Keluar dan logout idle) |
| Akses ditolak | `requireCan` / `assertCan` di `src/lib/auth-helpers.ts`, route `/api/logs/[day]` |
| Deteksi SQLi/XSS | `src/lib/security/detect.ts`, dipakai `inspect.ts` di login, pencarian global, form Customer, form Vendor |
| IP klien | `src/lib/security/client-ip.ts` |
| Geolokasi | `src/lib/security/geo.ts` (cache tabel `GeoIpCache`) |
| Rate limit bersama | `src/lib/security/rate-limit.ts` (tabel `RateLimitBucket`, atomik) |
| Notifikasi webhook | `src/lib/security/notify.ts` (dedup/cooldown di `SecurityAlert`) |
| Adapter WAF | `src/lib/security/waf.ts`, `POST /api/security/waf` |
| Retensi | `src/lib/security/retention.ts`, `POST /api/security/cleanup`, `npm run security:cleanup` |
| Dashboard | `src/app/(app)/security/*` |

Tabel: `SecurityEvent` (append-only), `SecurityEventReview` (status penanganan terpisah), `KnownDevice`, `RateLimitBucket`,
`GeoIpCache`, `SecuritySetting`, `SecurityAlert`. Migration: `prisma/migrations/20261115090000_security_monitoring` (hanya tabel baru).
Aplikasi single-tenant, jadi tidak ada `tenantId`.

## Environment variable

Semua opsional. Tanpa konfigurasi, fitur inti tetap jalan (IP tampil `unknown`, lokasi "tidak tersedia", notifikasi hanya di dashboard).

| Variable | Default | Fungsi |
| --- | --- | --- |
| `SECURITY_IP_HEADER` | `none` | Header IP yang **ditulis ulang proxy tepercaya**: `x-real-ip`, `x-forwarded-for`, atau `cf-connecting-ip` |
| `SECURITY_PROXY_HOPS` | `1` | Untuk `x-forwarded-for`: jumlah proxy tepercaya. IP klien = entri ke-N dari kanan |
| `SECURITY_HMAC_SECRET` | `AUTH_SECRET` | Kunci HMAC untuk email login gagal, cookie perangkat, dan hash perangkat |
| `SECURITY_GEO_PROVIDER` | `none` | `ipinfo` (butuh token) atau `ipapi` (ipapi.co) |
| `SECURITY_GEO_TOKEN` | - | Token provider geolokasi |
| `SECURITY_GEO_TIMEOUT_MS` | `1200` | Batas waktu lookup; gagal/timeout tidak mengganggu login |
| `SECURITY_ALERT_WEBHOOK_URL` | - | Kirim notifikasi event penting (JSON POST) |
| `SECURITY_ALERT_WEBHOOK_SECRET` | - | Tanda tangan `X-CargoFlow-Signature: sha256=<HMAC body>` |
| `SECURITY_WAF_WEBHOOK_SECRET` | - | Mengaktifkan `/api/security/waf` (minimal 16 karakter) |
| `SECURITY_WAF_REQUIRE_SIGNATURE` | `false` | Wajib header `X-Signature: sha256=<HMAC body>` |
| `SECURITY_CRON_SECRET` | - | Mengaktifkan `/api/security/cleanup` (minimal 16 karakter) |

Rate limit, mode deteksi, retensi, dan ambang notifikasi diatur di **Security > Konfigurasi** (tersimpan di database, perubahan tercatat).

## IP klien per deployment

Next.js App Router tidak memberikan alamat socket ke Server Action/Route Handler, jadi IP hanya bisa diambil dari header proxy.
Header itu **hanya** dipercaya bila proxy di depan aplikasi selalu menimpanya. Jangan aktifkan bila aplikasi bisa diakses langsung tanpa proxy.

- **Lokal (`next start`/`next dev` tanpa proxy):** biarkan `none`. IP tampil `unknown`. Ini benar, bukan error.
- **Nginx di VPS:** `proxy_set_header X-Real-IP $remote_addr;` lalu `SECURITY_IP_HEADER=x-real-ip`. Pastikan port Node tidak terbuka ke publik.
- **Nginx dengan X-Forwarded-For:** `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` lalu `SECURITY_IP_HEADER=x-forwarded-for`, `SECURITY_PROXY_HOPS=1`.
- **Cloudflare di depan Nginx:** pakai modul `real_ip` Nginx dengan daftar IP Cloudflare, lalu tetap `x-real-ip`. `cf-connecting-ip` hanya bila origin menolak koneksi selain dari Cloudflare.
- **ngrok (demo):** ngrok menambahkan IP klien ke `X-Forwarded-For`: `SECURITY_IP_HEADER=x-forwarded-for`, `SECURITY_PROXY_HOPS=1`.
- **Hostinger (LiteSpeed Node.js app):** periksa dulu header yang benar-benar ditulis LiteSpeed di server tersebut sebelum mengaktifkan.

IPv4 dan IPv6 didukung; nilai yang bukan IP menjadi `unknown`.

## Perangkat baru dan login mencurigakan

- Cookie `cf_device`: id acak + tanda tangan HMAC, HttpOnly, SameSite=Lax, Secure di production. Database hanya menyimpan hash.
  Ini sinyal pengenalan perangkat, **bukan** bukti autentikasi dan bukan pengganti MFA. Hapus cookie = perangkat baru.
- Login pertama sebuah akun menjadi baseline (tidak ada event perangkat baru).
- `NEW_DEVICE_LOGIN`: cookie perangkat belum dikenal untuk akun itu.
- `SUSPICIOUS_LOGIN`: negara berbeda dari riwayat 180 hari (butuh geolokasi aktif), atau 3+ login gagal sebelum berhasil dalam 30 menit.
- Perubahan IP saja tidak pernah dianggap serangan dan tidak memblokir user.

## Rate limiting login

Default: 5 gagal per akun (HMAC email) atau 30 gagal per IP dalam 10 menit memicu pembatasan sementara 15 menit.
Blokir selalu sementara, tidak ada kunci permanen. Pesan ke user generik ("Email atau password salah" / "Terlalu banyak percobaan"),
tidak membedakan akun terdaftar atau tidak. Akun yang tidak terdaftar tetap menjalankan bcrypt (waktu respons mirip).
Pembatasan berlaku juga untuk POST langsung ke `/api/auth/callback/credentials` karena dicek di `authorize()`.
Bila IP `unknown`, hanya batas per akun yang aktif. `RATE_LIMIT_EXCEEDED` dicatat sekali per blokir.

## Deteksi SQL injection / XSS

- Aturan di `detect.ts` (rule id seperti `sqli.tautology`, `xss.event_handler`). Kata tunggal (SELECT, apostrof, O'Brien) tidak memicu.
- Default **LOG_ONLY**. Mode BLOCK (opsional) menolak input di pencarian global, form Customer, dan form Vendor.
- Input dipotong 2.000 karakter, regex tanpa kuantifier bersarang (diuji terhadap input 100 ribu karakter).
- Pemeriksaan memakai data yang sudah di-parse handler; body request tidak dibaca dua kali.
- Ini bukan pencegahan. Pencegahannya: semua query lewat Prisma (parameter binding). Audit: `$queryRaw` di `journal-search.ts`,
  `tax.ts`, dan rate limiter memakai tagged template (terparameter); `$executeRawUnsafe` di `prisma/seed.ts` hanya memakai nama tabel
  dari `pg_tables`, bukan input user. Tidak ditemukan interpolasi input ke raw SQL.
- Tidak mendeteksi semua serangan atau zero-day.

## WAF

Request yang diblokir WAF **sebelum** mencapai Next.js tidak muncul di log aplikasi. Untuk memasukkannya ke dashboard,
WAF atau skrip penghubung (mis. Logpush/worker) harus mengirim:

```
POST /api/security/waf
Authorization: Bearer <SECURITY_WAF_WEBHOOK_SECRET>
X-Signature: sha256=<HMAC-SHA256 body>   (bila SECURITY_WAF_REQUIRE_SIGNATURE=true)

{ "events": [ { "id": "evt-123", "provider": "cloudflare", "category": "sqli", "action": "block",
  "ruleId": "942100", "ip": "203.0.113.5", "method": "GET", "path": "/login", "country": "ID", "message": "SQLi" } ] }
```

Maksimal 100 event dan 256 KB per request. Event dengan `provider` + `id` sama hanya disimpan sekali.
Tidak semua paket WAF menyediakan webhook atau ekspor log; cek paket yang dipakai.

## Penyimpanan, retensi, dan keandalan

- Retensi default 90 hari. Jadwalkan salah satu:
  - cron di server: `npm run security:cleanup` (harian), atau
  - `curl -X POST -H "Authorization: Bearer $SECURITY_CRON_SECRET" https://<domain>/api/security/cleanup`.
  Admin juga bisa menjalankan dari halaman Konfigurasi.
- Penulisan event selalu di-await (tanpa fire-and-forget). Gagal menulis tidak menggagalkan login; ringkasan tersanitasi ditulis ke
  file log (`security_event_write_failed`) dan jumlahnya tampil di kartu kesehatan dashboard.
- Volume dibatasi per sumber per menit (mis. 60 login gagal, 30 akses ditolak, 30 indikasi SQLi/XSS) untuk mencegah tabel dipenuhi.
- Tidak disimpan: password, token, cookie, API key, connection string, body request, query string. Email login gagal disimpan
  sebagai HMAC + mask. Metadata dibatasi 20 kunci, kedalaman 2, 300 karakter, kunci/nilai yang tampak rahasia di-redact.
- Dashboard merender semua isi log sebagai teks (React escape), jadi payload di log tidak dieksekusi.

## Pengujian

- Unit: `npx vitest run tests/unit/security.test.ts`
- Integrasi (database uji): `DATABASE_URL=.../ffms_test npx tsx tests/integration/verify-security.ts`
- E2E (server yang memakai database uji): `DATABASE_URL=.../ffms_test npx playwright test e2e/security.spec.ts`
