-- Aturan client SLG (5-6 Nov 2026): Operation tidak boleh melihat nilai tagihan ke customer, dan hanya Finance yang
-- menginput biaya. Role bawaan Operation dari Role Management memegang izin costing, laporan, rate card, charge code,
-- rate, quotation, dan input biaya; izin itu dicabut supaya sama dengan hak Ops sebelum Role Management.
-- Hanya role bawaan Operation; role kustom lain tidak disentuh. Super Admin tetap bisa memberikannya lewat Role Management.
UPDATE "AppRole"
SET "permissions" = (
      SELECT COALESCE(jsonb_agg(p.value ORDER BY p.ord), '[]'::jsonb)
      FROM jsonb_array_elements("permissions") WITH ORDINALITY AS p(value, ord)
      WHERE p.value #>> '{}' NOT IN (
        'costing.view', 'reports.view', 'reports.export',
        'charges.view', 'rateCard.view', 'rates.view',
        'quotations.view', 'quotations.viewAll', 'quotations.return', 'quotations.send', 'quotations.sendLowMargin',
        'quotations.decide', 'quotations.convert',
        'jobs.charges', 'jobs.fleetCost', 'jobs.viewFinancials'
      )
    ),
    "description" = 'Mengelola job, container, clearance, booking, dokumen, dan domestik. Tidak melihat nilai tagihan maupun costing.',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'OPERATION' AND "isSystem" = false;
