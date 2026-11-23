-- Padanan MariaDB dari prisma/migrations-postgresql-archive/20261125090000_company_sentra (merge client d1de500).
-- Identitas client (2026-11-23): PT Sentra Logistik Global, alamat kantor Pelindo Tower, rekening Bank Mandiri.
-- Hanya mengganti data demo seed lama (PT Samudra Lintas Logistik / BCA Operasional 0881234567). Data yang sudah diisi
-- sendiri di Pengaturan tidak ditimpa. Telepon, email, website, dan NPWP demo dikosongkan (nilai palsu); admin
-- mengisinya di Pengaturan bila sudah ada. Logo tidak perlu diubah: tanpa unggahan, cetakan memakai logo vektor bawaan.
UPDATE `CompanySetting`
SET `name` = 'PT Sentra Logistik Global',
    `legalName` = 'PT Sentra Logistik Global',
    `address` = 'Dock Desk Coworking Space, Pelindo Tower Lantai 4, Jl. Yos Sudarso No. 9 RT. 006 RW. 013, Rawa Badak Utara, Koja',
    `city` = 'Kota Adm. Jakarta Utara, DKI Jakarta 14230',
    `npwp` = NULL, `phone` = NULL, `email` = NULL, `website` = NULL,
    `bankName` = 'Bank Mandiri',
    `bankAccount` = '103-00-1361596-4',
    `bankHolder` = 'PT Sentra Logistik Global',
    `bankBranch` = NULL,
    `updatedAt` = CURRENT_TIMESTAMP(3)
WHERE `name` = 'PT Samudra Lintas Logistik';

UPDATE `BankAccount`
SET `name` = 'Mandiri Utama',
    `bankName` = 'Bank Mandiri',
    `accountNo` = '103-00-1361596-4',
    `accountHolder` = 'PT Sentra Logistik Global',
    `branch` = NULL
WHERE `name` = 'BCA Operasional' AND `accountNo` = '0881234567';

-- Nama akun 1200 versi seed ("Bank BCA") atau versi yang dibuat aplikasi saat rekening demo diedit (nama + nomor).
UPDATE `CoaAccount` SET `name` = 'Bank Mandiri'
WHERE `code` = '1200' AND `name` IN ('Bank BCA', 'BCA Operasional 0881234567');
