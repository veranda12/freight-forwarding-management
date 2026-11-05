-- Menyiapkan database dan user aplikasi di MariaDB (10.11+) untuk pengembangan lokal.
-- Jalankan sekali sebagai root (sesuaikan port):
--   mariadb -u root -p -h 127.0.0.1 -P 3307 < scripts/setup-db.sql
-- Di hosting, database dan user biasanya dibuat lewat panel (cPanel → MySQL Databases); file ini tidak dipakai di sana.

CREATE DATABASE IF NOT EXISTS ffms CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS ffms_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'ffms'@'localhost' IDENTIFIED BY 'ffms123';
CREATE USER IF NOT EXISTS 'ffms'@'127.0.0.1' IDENTIFIED BY 'ffms123';

GRANT ALL PRIVILEGES ON ffms.* TO 'ffms'@'localhost', 'ffms'@'127.0.0.1';
GRANT ALL PRIVILEGES ON ffms_test.* TO 'ffms'@'localhost', 'ffms'@'127.0.0.1';
-- `prisma migrate dev` membuat shadow database sementara bernama prisma_migrate_shadow_db_<uuid> (khusus lokal).
GRANT ALL PRIVILEGES ON `prisma\_migrate\_shadow\_db\_%`.* TO 'ffms'@'localhost', 'ffms'@'127.0.0.1';
FLUSH PRIVILEGES;
