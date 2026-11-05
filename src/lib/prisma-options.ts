import { Prisma } from "@prisma/client";

/**
 * Opsi bersama untuk setiap PrismaClient (aplikasi, seed, skrip, uji integrasi).
 *
 * MariaDB memakai REPEATABLE READ sebagai isolasi bawaan, sedangkan logika transaksi aplikasi ini ditulis untuk
 * READ COMMITTED (bawaan PostgreSQL): sesudah menunggu kunci baris, pembacaan berikutnya harus melihat data yang
 * sudah di-commit transaksi lain (mis. setor pajak per masa, lihat lib/tax.ts). Jangan hapus tanpa kajian ulang.
 */
export const PRISMA_CLIENT_OPTIONS = {
  transactionOptions: { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
} satisfies Prisma.PrismaClientOptions;
