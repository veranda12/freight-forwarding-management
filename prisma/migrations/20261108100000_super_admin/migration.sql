-- Role sistem Super Admin (keputusan Andhika 2026-11-08). Super Admin = semua izin; Admin = semua izin kecuali
-- Role Management (roles.view, roles.manage), yang khusus Super Admin dan tidak bisa diberikan ke role kustom.
-- Izin role sistem dihitung dari kode (permissionsOfRole di src/lib/permissions.ts); kolom permissions di bawah hanya
-- catatan. Aman untuk database yang sudah berisi data.

-- 1. Role Super Admin
INSERT INTO "AppRole" ("id", "key", "name", "description", "isSystem", "permissions", "createdAt", "updatedAt") VALUES
  ('role_super_admin', 'SUPER_ADMIN', 'Super Admin', 'Akses penuh ke seluruh modul termasuk Role Management (role sistem, tidak bisa diubah).', true, '["dashboard.view","rates.view","rates.create","rates.edit","quotations.view","quotations.viewAll","quotations.create","quotations.submit","quotations.return","quotations.send","quotations.sendLowMargin","quotations.decide","quotations.decideOwn","quotations.convert","jobs.view","jobs.viewAll","jobs.viewFinancials","jobs.create","jobs.status","jobs.cancel","jobs.milestone","jobs.charges","jobs.containers","jobs.clearance","jobs.fleetCost","jobs.bl","jobs.close","jobs.reopen","bookings.view","documents.view","documents.generate","tracking.view","domestic.view","domestic.viewAll","domestic.create","domestic.status","domestic.cancel","domestic.cancelOwn","domestic.invoice","domestic.print","domesticCheck.view","domesticTariffs.view","domesticTariffs.edit","proofs.view","costing.view","invoices.view","invoices.viewAll","invoices.create","invoices.edit","invoices.receipt","invoices.cancel","invoices.cancelOwn","invoices.print","bills.view","bills.viewAll","bills.create","bills.pay","vouchers.view","vouchers.viewAll","vouchers.create","vouchers.pay","vouchers.cancel","vouchers.cancelOwn","vouchers.print","notes.view","notes.viewAll","payments.view","payments.viewAll","accounting.view","cashEntry.view","cashEntry.create","cashEntry.edit","cashEntry.cancel","cashEntry.cancelOwn","cashEntry.transfer","cashEntry.transferCancel","cashEntry.transferCancelOwn","manualJournal.view","manualJournal.create","manualJournal.edit","manualJournal.cancel","manualJournal.cancelOwn","kasir.view","cashFlow.view","closing.view","closing.lockPeriod","closing.closeYear","fixedAssets.view","fixedAssets.manage","fixedAssets.depreciate","tax.view","tax.remit","tax.cancel","tax.cancelOwn","bankRec.view","bankRec.manage","fx.view","fx.revalue","reports.view","reports.export","customers.view","customers.viewAll","customers.create","customers.edit","vendors.view","vendors.edit","agents.view","agents.edit","ports.view","ports.edit","bankAccounts.view","bankAccounts.edit","vehicles.view","vehicles.edit","currencies.view","currencies.edit","currencies.sync","charges.view","charges.create","charges.edit","rateCard.view","rateCard.edit","weightRules.view","weightRules.edit","containers.view","containers.edit","commodities.view","commodities.edit","taxes.view","taxes.edit","taxes.ppnRate","coa.view","coa.create","users.view","users.manage","roles.view","roles.manage","audit.view","logs.view","settings.view","settings.edit"]'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- 2. Admin tanpa Role Management; role kustom tidak boleh memegang izin khusus Super Admin
UPDATE "AppRole"
SET "description" = 'Akses penuh ke seluruh modul kecuali Role Management (role sistem, tidak bisa diubah).',
    "permissions" = "permissions" - 'roles.view' - 'roles.manage',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'role_admin';
UPDATE "AppRole"
SET "permissions" = "permissions" - 'roles.view' - 'roles.manage', "updatedAt" = CURRENT_TIMESTAMP
WHERE NOT "isSystem" AND ("permissions" ? 'roles.view' OR "permissions" ? 'roles.manage');

-- 3. Tepat satu Admin lama menjadi Super Admin: Admin aktif yang paling lama dibuat (bila tidak ada yang aktif, Admin
--    paling lama dibuat). Admin lain tetap Admin. Tanpa Admin sama sekali: tidak ada yang diubah.
UPDATE "User" SET "roleId" = 'role_super_admin', "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = (
  SELECT "id" FROM "User" WHERE "roleId" = 'role_admin'
  ORDER BY "isActive" DESC, "createdAt" ASC, "id" ASC
  LIMIT 1
);
