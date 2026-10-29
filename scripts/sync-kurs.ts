/**
 * Mengambil kurs harian dari Frankfurter (data ECB) dan menyimpannya ke database.
 *   npm run kurs:sync
 * Jadwalkan harian dengan Windows Task Scheduler (contoh: setiap hari 08.00) memanggil perintah di atas
 * dari folder proyek.
 */
import { PrismaClient } from "@prisma/client";
import { syncKurs } from "../src/lib/kurs-sync";

const db = new PrismaClient();

syncKurs(db)
  .then((r) => {
    console.log(`Kurs tanggal ${r.date} tersimpan: ${r.updated} mata uang`);
    console.log(Object.entries(r.rates).map(([c, v]) => `  1 ${c} = ${v.toLocaleString("id-ID")} IDR`).join("\n"));
    if (r.skipped.length) console.log(`Dilewati (tidak ada di sumber): ${r.skipped.join(", ")}`);
    console.log(`Sumber: ${r.source}`);
  })
  .catch((e) => {
    console.error("Gagal mengambil kurs:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
