-- Beban operasional yang dipisah dari 6300 Administrasi & Umum.
-- Idempoten: akun yang sudah ada tidak diubah. Induk 6000 dipasang bila ada.
INSERT INTO "CoaAccount" ("id", "code", "name", "type", "normalBalance", "isActive", "isPostable", "parentId")
SELECT 'coa_' || v.code, v.code, v.name, 'EXPENSE'::"AccountType", 'DEBIT'::"NormalBalance", true, true,
       (SELECT p."id" FROM "CoaAccount" p WHERE p."code" = '6000')
FROM (VALUES
  ('6310', 'Beban Listrik & Air'),
  ('6320', 'Beban Telepon & Internet'),
  ('6330', 'Beban Alat Tulis Kantor'),
  ('6340', 'Beban Transportasi & Perjalanan Dinas'),
  ('6350', 'Beban Administrasi Bank'),
  ('6360', 'Beban Pemeliharaan & Perbaikan'),
  ('6390', 'Beban Operasional Lain-lain')
) AS v(code, name)
WHERE NOT EXISTS (SELECT 1 FROM "CoaAccount" a WHERE a."code" = v.code);
