# PLAN.md — Freight Forwarding Management System

## Struktur Folder

```
prisma/
  schema.prisma        # 40+ model (auth, master, sales, job, finance, GL)
  seed.ts              # seed deterministik (faker.seed)
  seed-helpers.ts      # NPWP, ISO 6346 check digit, weighted pick
src/
  auth.ts, auth.config.ts, middleware.ts   # Auth.js v5 + RBAC edge-safe
  config/              # product.ts ({NAMA_PRODUK}), nav.ts
  lib/                 # prisma, format, rbac, auth-helpers, sequence, audit,
                       # enums, analytics, accounting, pdf/
  components/          # ui/ (shadcn), shell/ (sidebar+topbar), charts, data-table, dll
  app/
    login/             # halaman login (public)
    track/             # tracking publik (public, tanpa harga)
    (app)/             # area terproteksi (shell sidebar + topbar)
      dashboard/ jobs/ quotations/ bookings/ documents/ tracking/
      costing/ invoices/ bills/ notes/ payments/ accounting/ reports/
      customers/ vendors/ agents/ ports/ currencies/ charges/
      containers/ commodities/ taxes/ coa/ users/ audit/ settings/
    api/
      auth/[...nextauth]/   # Auth.js handler
      search/               # global search (job/customer/container)
      documents/[type]/[jobId]/  # generate PDF B/L, AWB, SI, Arrival, DO
      reports/excel/        # export Excel (exceljs)
```

## Daftar Model Prisma (ringkas)

- **Auth/Sistem**: User, Account, Session, VerificationToken, CompanySetting, Sequence, AuditLog
- **Master**: Customer, CustomerContact, Vendor, OverseasAgent, Port, Airport, Currency, ExchangeRate, ChargeCode, ContainerType, Commodity, TaxRate
- **Akuntansi**: CoaAccount, JournalEntry, JournalLine
- **Sales**: Rate, Quotation, QuotationLine
- **Operasional**: Job, JobContainer, Milestone, JobDocument, Booking
- **Finance**: CostingLine, Invoice, InvoiceLine, VendorBill, BillLine, Note, Payment, PaymentAllocation

## Daftar Halaman

Dashboard · Rate · Quotation (+detail +convert) · Job (+detail 7 tab +new) · Booking ·
Dokumentasi · Tracking (internal + publik) · Costing · Invoice (+detail) · Vendor Bill ·
Debit/Credit Note · Receipt & Payment · Accounting (TB/L-R/Neraca/Jurnal) · Reporting ·
Customer (+detail) · Vendor · Overseas Agent · Port & Airport · Currency & Kurs · Charge Code ·
Container Type · Commodity · Pajak · Chart of Accounts · User · Audit Log · Setting.

## Urutan Pengerjaan (status)

1. ✅ Rencana (PLAN.md) & keputusan (DECISIONS.md)
2. ✅ Setup project, Prisma schema, env (PostgreSQL lokal, tanpa Docker)
3. ✅ Auth + RBAC + layout aplikasi (sidebar/topbar, global search)
4. ✅ Master data (tampilan list; CRUD Customer sebagai contоh)
5. ✅ Sales: rate & quotation (+ convert ke job)
6. ✅ Job/shipment, booking, milestone, tracking publik
7. ✅ Costing & profitability
8. ✅ Finance: invoice, bill, payment, jurnal otomatis, laporan keuangan
9. ✅ Documentation PDF
10. ✅ Dashboard & reporting (+ export Excel)
11. ✅ Seed data demo lengkap
12. ⏳ Verifikasi akhir — menunggu kredensial DB untuk migrate + seed + `npm run build`
```
