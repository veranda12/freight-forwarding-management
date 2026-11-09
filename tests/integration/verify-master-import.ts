/**
 * Uji import Excel master Customer, Vendor, Commodity terhadap database: pratinjau tidak menulis, simpan = pratinjau,
 * kode berurutan, kontak dan Sales PIC, update hanya kolom yang diisi (sel kosong = nilai lama), penghalang dilewati,
 * peringatan tetap tersimpan, nilai sel (NPWP angka, email hyperlink, header beda urutan, baris kosong), file ditolak,
 * dan simpan memvalidasi ulang file.
 * Hanya untuk database UJI: menolak "ffms" dan "ffms_pgcheck".
 * Jalankan: DATABASE_URL=.../ffms_part2 npx tsx tests/integration/verify-master-import.ts
 */
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";
import { commitImport, previewImport, buildTemplate, MAX_ROWS, type ImportKind } from "../../src/lib/master-import";

const db = new PrismaClient();
let failures = 0;
const ok = (c: boolean, msg: string) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) failures++; };
const throws = async (fn: () => Promise<unknown>, re: RegExp, msg: string) => {
  try { await fn(); ok(false, `${msg} (tidak ditolak)`); } catch (e: any) { ok(re.test(e.message), `${msg}: "${e.message}"`); }
};

/** Workbook uji: baris pertama header, sisanya data (nilai mentah exceljs, boleh hyperlink/angka). */
async function xlsx(header: string[], rows: ExcelJS.CellValue[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Data");
  ws.addRow(header);
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
const counts = async () => ({ c: await db.customer.count(), v: await db.vendor.count(), k: await db.commodity.count() });

async function main() {
  const dbName = (await db.$queryRaw<{ d: string }[]>`SELECT current_database() AS d`)[0].d;
  if (dbName === "ffms" || dbName === "ffms_pgcheck") throw new Error(`Jangan jalankan uji ini di database ${dbName}.`);
  console.log(`   database: ${dbName}`);
  const ts = Date.now() % 1_000_000;

  // 1. Customer: baru (dengan kontak, PIC, NPWP angka, email hyperlink), peringatan, penghalang, update
  const existing = await db.customer.findFirstOrThrow({ orderBy: { code: "asc" } });
  const before = await db.customer.findUniqueOrThrow({ where: { id: existing.id } });
  const sales = await db.user.findFirstOrThrow({ where: { role: "SALES", isActive: true } });
  const lastCode = (await db.customer.findFirst({ where: { code: { startsWith: "CUST" } }, orderBy: { code: "desc" } }))!.code;
  const nextN = parseInt(lastCode.replace("CUST", ""), 10) + 1;
  const custFile = await xlsx(
    // urutan kolom sengaja berbeda dari template, header ber-* dan beda huruf
    ["Email", "NAMA *", "Kode", "NPWP", "TOP (hari)", "Credit Limit", "Email Sales PIC", "Nama Kontak", "Kota", "Shipper"],
    [
      [{ text: `fin${ts}@baru.co.id`, hyperlink: `mailto:fin${ts}@baru.co.id` }, `PT Import Baru ${ts}`, "", 1234567890123456 > 0 ? "0012345678901000" : "", 45, "1.500.000", sales.email, "Budi", "Bekasi", "Ya"],
      [`salah-email`, `PT Import Peringatan ${ts}`, "", 123, "", "", "tidak@ada.id", "", "", ""],
      [], // baris kosong di tengah
      ["", "", "", "", "", "", "", "", "Tanpa Nama", ""],
      ["", `PT Import TOP ${ts}`, "", "", 999, "", "", "", "", ""],
      ["", existing.name.toUpperCase(), "", "", "", "", "", "", "", ""],
      ["", "", existing.code, "", 60, "", "", "Kontak X", "", ""],
      ["", "", "CUST9999", "", "", "", "", "", "Bogor", ""],
    ],
  );
  const c0 = await counts();
  const prev = await previewImport(db, "customers", custFile);
  ok((await counts()).c === c0.c, "pratinjau tidak menulis apa pun");
  ok(prev.summary.create === 2 && prev.summary.update === 1 && prev.summary.skip === 4, `ringkasan pratinjau customer: ${JSON.stringify(prev.summary)}`);
  ok(prev.rows.map((r) => r.row).join(",") === "2,3,5,6,7,8,9", "nomor baris Excel dipertahankan, baris kosong dilewati");
  const res = await commitImport(db, "customers", custFile);
  ok(JSON.stringify(res.summary) === JSON.stringify(prev.summary), "hasil simpan = pratinjau");
  ok((await counts()).c === c0.c + 2, "2 customer baru tersimpan");
  const nb = await db.customer.findFirstOrThrow({ where: { name: `PT Import Baru ${ts}` }, include: { contacts: true } });
  ok(nb.code === `CUST${String(nextN).padStart(4, "0")}`, `kode berurutan setelah ${lastCode}: ${nb.code}`);
  ok(nb.email === `fin${ts}@baru.co.id` && nb.npwp === "0012345678901000" && nb.termOfPayment === 45 && Number(nb.creditLimit) === 1_500_000,
    "email dari sel hyperlink, NPWP teks, TOP, credit limit format Indonesia");
  ok(nb.salesPicId === sales.id && nb.contacts.length === 1 && nb.contacts[0].isPrimary && nb.isShipper && nb.isConsignee && nb.country === "Indonesia",
    "Sales PIC dari email, kontak utama, bawaan Shipper/Consignee/Negara");
  const warn = await db.customer.findFirstOrThrow({ where: { name: `PT Import Peringatan ${ts}` } });
  ok(warn.email === "salah-email" && warn.npwp === "123" && warn.salesPicId === null && warn.termOfPayment === 30, "baris berperingatan tetap disimpan apa adanya; PIC kosong; TOP bawaan 30");
  const after = await db.customer.findUniqueOrThrow({ where: { id: existing.id }, include: { contacts: true } });
  ok(after.termOfPayment === 60 && after.name === before.name && after.city === before.city && after.email === before.email && Number(after.creditLimit) === Number(before.creditLimit),
    "update lewat kode: hanya TOP berubah, sel kosong = nilai lama");
  ok(!after.contacts.some((x) => x.name === "Kontak X"), "kontak pada baris update diabaikan");
  ok(!(await db.customer.findFirst({ where: { name: `PT Import TOP ${ts}` } })), "baris penghalang (TOP 999) tidak tersimpan");

  // 2. Vendor: tipe label/kode, PPh 26, penghalang tipe, update by kode
  const vend = await db.vendor.findFirstOrThrow({ orderBy: { code: "asc" } });
  const vendFile = await xlsx(
    ["Kode", "Nama", "Tipe", "Luar Negeri", "Tarif PPh 26 (%)", "Kota", "Aktif"],
    [
      ["", `Agen Luar ${ts}`, "Shipping Line", "Ya", "20", "Singapore", ""],
      ["", `PT Truk Import ${ts}`, "TRUCKING", "", "", "Cikarang", ""],
      ["", `PT Tipe Salah ${ts}`, "Kapal Selam", "", "", "", ""],
      [vend.code, "", "", "", "", "", "Tidak"],
    ],
  );
  const v0 = await counts();
  const vr = await commitImport(db, "vendors", vendFile);
  ok(vr.summary.create === 2 && vr.summary.update === 1 && vr.summary.skip === 1, `ringkasan vendor: ${JSON.stringify(vr.summary)}`);
  ok((await counts()).v === v0.v + 2, "2 vendor baru tersimpan");
  const fv = await db.vendor.findFirstOrThrow({ where: { name: `Agen Luar ${ts}` } });
  ok(fv.type === "SHIPPING_LINE" && fv.isForeign && Number(fv.pph26Rate) === 20 && /^VEND\d{4,}$/.test(fv.code), `vendor luar negeri ${fv.code}, PPh 26 20%`);
  const vu = await db.vendor.findUniqueOrThrow({ where: { id: vend.id } });
  ok(vu.isActive === false && vu.name === vend.name && vu.type === vend.type, "update vendor: hanya Aktif berubah");
  await db.vendor.update({ where: { id: vend.id }, data: { isActive: vend.isActive } });

  // 3. Commodity: baru, Aktif berubah, tidak berubah, ganda
  const com = await db.commodity.findFirstOrThrow();
  const comFile = await xlsx(
    ["HS Code", "Nama", "Aktif"],
    [
      [`99${ts}.10`, `Barang Uji ${ts}`, ""],
      [com.hsCode, com.name, com.isActive ? "Tidak" : "Ya"],
      [com.hsCode, com.name.toUpperCase(), ""],
      [`99${ts}.10`, `barang uji ${ts}`, ""],
    ],
  );
  const k0 = await counts();
  const kr = await commitImport(db, "commodities", comFile);
  ok(kr.summary.create === 1 && kr.summary.update === 1 && kr.summary.skip === 2, `ringkasan commodity: ${JSON.stringify(kr.summary)}`);
  ok((await counts()).k === k0.k + 1 && (await db.commodity.findUniqueOrThrow({ where: { id: com.id } })).isActive === !com.isActive, "1 commodity baru, Aktif commodity lama berubah");
  await db.commodity.update({ where: { id: com.id }, data: { isActive: com.isActive } });

  // 4. Import ulang file yang sama: baris baru kini terdeteksi sudah ada (tidak ganda)
  const again = await previewImport(db, "customers", custFile);
  ok(again.summary.create === 0 && !!again.rows.find((r) => r.row === 2)?.errors.join().includes("sudah ada sebagai"), "file yang sama diimport ulang: tidak membuat data ganda");

  // 5. File ditolak
  await throws(() => previewImport(db, "customers", Buffer.from("bukan excel")), /bukan Excel/, "file bukan xlsx ditolak");
  await throws(async () => previewImport(db, "vendors", await xlsx(["Nama", "Kota"], [["PT X", "Y"]])), /Kolom wajib.*Tipe/, "kolom wajib hilang ditolak");
  await throws(async () => previewImport(db, "commodities", await xlsx(["HS Code", "Nama"], Array.from({ length: MAX_ROWS + 1 }, (_, i) => [`1${i}`, `B${i}`]))), /Maksimal 1000/, "lebih dari 1000 baris ditolak");
  await throws(async () => previewImport(db, "customers", await xlsx(["Nama"], [])), /Tidak ada baris data/, "file tanpa data ditolak");

  // 6. Template bisa dipakai langsung: template + 1 baris → tersimpan
  for (const kind of ["customers", "vendors", "commodities"] as ImportKind[]) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await buildTemplate(kind) as unknown as ArrayBuffer);
    const row = kind === "commodities" ? [`77${ts}.00`, `Template ${ts}`, "Ya"] : kind === "vendors" ? ["", `PT Template V ${ts}`, "Depo"] : ["", `PT Template C ${ts}`];
    wb.worksheets[0].addRow(row);
    const r = await commitImport(db, kind, Buffer.from(await wb.xlsx.writeBuffer()));
    ok(r.summary.create === 1 && r.summary.skip === 0, `template ${kind} + 1 baris → 1 data baru`);
  }

  console.log(failures ? `\n${failures} GAGAL` : "\nSemua lulus");
  if (failures) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
