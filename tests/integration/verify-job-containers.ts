/**
 * Uji tambah, ubah, dan hapus container job (JANGAN dijalankan di database demo). Data uji dihapus di akhir.
 */
import { PrismaClient } from "@prisma/client";
import { saveJobContainer, deleteJobContainer, validateContainerNo } from "../../src/lib/job-containers";

const db = new PrismaClient();
let failures = 0;
const ok = (c: boolean, msg: string) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) failures++; };

async function expectThrow(fn: () => Promise<unknown>, pattern: RegExp, msg: string) {
  try { await fn(); ok(false, `${msg} (tidak melempar error)`); }
  catch (e: any) { ok(pattern.test(e.message), `${msg}: "${e.message}"`); }
}

async function main() {
  const existing = await db.jobContainer.findMany({ select: { containerNo: true } });
  const invalid = existing.filter((c) => { try { validateContainerNo(c.containerNo); return false; } catch { return true; } });
  ok(invalid.length === 0, `container seed lolos validasi ISO 6346 (${existing.length} data, ${invalid.length} tidak lolos)`);

  const jobs = await db.job.findMany({ take: 2, orderBy: { createdAt: "asc" }, select: { id: true } });
  const type = await db.containerType.findFirst({ where: { isActive: true }, select: { id: true } });
  if (jobs.length === 0 || !type) { ok(false, "data dasar job atau tipe container tidak ada"); return; }
  const [job, other] = jobs;

  const created = await saveJobContainer(db, job.id, { containerNo: "CSQU3054383", containerTypeId: type.id, sealNo: "sl0000001", grossWeightKg: 20000 });
  ok(created.containerNo === "CSQU3054383", "container baru tersimpan");

  const updated = await saveJobContainer(db, job.id, {
    id: created.id, containerNo: "CSQU3054383", containerTypeId: type.id, sealNo: "SL0000002", grossWeightKg: 21000, volumeCbm: 30,
  });
  const row = await db.jobContainer.findUnique({ where: { id: created.id } });
  ok(updated.id === created.id && row?.sealNo === "SL0000002", "seal berhasil diubah tanpa membuat baris baru");
  ok(Number(row?.grossWeightKg) === 21000 && Number(row?.volumeCbm) === 30, "berat dan volume tersimpan");

  await expectThrow(() => saveJobContainer(db, job.id, { containerNo: "CSQU3054383", containerTypeId: type.id }), /sudah ada di job ini/, "nomor duplikat dalam satu job ditolak");
  await expectThrow(() => saveJobContainer(db, job.id, { containerNo: "CSQU3054384", containerTypeId: type.id }), /ISO 6346/, "digit cek salah ditolak");
  await expectThrow(() => saveJobContainer(db, job.id, { containerNo: "CSQU3054383", containerTypeId: "" }), /Tipe container/, "tipe kosong ditolak");
  if (other) {
    await expectThrow(() => saveJobContainer(db, other.id, { id: created.id, containerNo: "CSQU3054383", containerTypeId: type.id }), /tidak ditemukan di job ini/, "ubah container dari job lain ditolak");
    await expectThrow(() => deleteJobContainer(db, other.id, created.id), /tidak ditemukan di job ini/, "hapus container dari job lain ditolak");
  }

  await deleteJobContainer(db, job.id, created.id);
  ok((await db.jobContainer.count({ where: { id: created.id } })) === 0, "container uji berhasil dihapus");

  console.log(failures === 0 ? "ALL PASS" : `${failures} FAIL`);
  if (failures) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
