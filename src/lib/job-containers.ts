import { Prisma, type PrismaClient } from "@prisma/client";

export type ContainerInput = {
  id?: string;
  containerNo: string;
  sealNo?: string | null;
  containerTypeId: string;
  grossWeightKg?: number | string | null;
  volumeCbm?: number | string | null;
};

/** Nilai huruf untuk digit cek ISO 6346: A=10, B=12, ... (kelipatan 11 dilewati). */
const ISO_VALUES: Record<string, number> = (() => {
  const map: Record<string, number> = {};
  let v = 10;
  for (const ch of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
    if (v % 11 === 0) v++;
    map[ch] = v++;
  }
  return map;
})();

/** Digit cek ISO 6346 dari 10 karakter pertama nomor container. */
export function isoCheckDigit(code10: string): number {
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const ch = code10[i];
    const val = /[0-9]/.test(ch) ? Number(ch) : ISO_VALUES[ch];
    sum += val * 2 ** i;
  }
  const d = sum % 11;
  return d === 10 ? 0 : d;
}

/** Validasi nomor container: 3 huruf pemilik, kategori U/J/Z/R, 6 digit serial, 1 digit cek. */
export function validateContainerNo(raw: string): string {
  const no = (raw ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (!/^[A-Z]{3}[UJZR]\d{7}$/.test(no)) {
    throw new Error("Nomor container harus 11 karakter: 3 huruf pemilik, kategori U/J/Z/R, lalu 7 digit. Contoh: CSQU3054383.");
  }
  if (isoCheckDigit(no.slice(0, 10)) !== Number(no[10])) {
    throw new Error(`Digit cek nomor ${no} tidak sesuai ISO 6346. Periksa lagi nomor di dokumen.`);
  }
  return no;
}

function optionalNumber(v: unknown, label: string): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${label} harus berupa angka.`);
  return n;
}

/** Validasi murni input container job. */
export function validateJobContainerInput(input: ContainerInput) {
  const containerNo = validateContainerNo(input.containerNo);
  const sealNo = (input.sealNo ?? "").trim().toUpperCase() || null;
  if (sealNo && sealNo.length > 30) throw new Error("No. seal maksimal 30 karakter.");
  if (!input.containerTypeId) throw new Error("Tipe container wajib dipilih.");
  const grossWeightKg = optionalNumber(input.grossWeightKg, "Berat kotor");
  if (grossWeightKg !== null && (grossWeightKg <= 0 || grossWeightKg > 40000)) {
    throw new Error("Berat kotor harus antara 1 dan 40.000 kg.");
  }
  const volumeCbm = optionalNumber(input.volumeCbm, "Volume");
  if (volumeCbm !== null && (volumeCbm < 0 || volumeCbm > 200)) {
    throw new Error("Volume harus antara 0 dan 200 cbm.");
  }
  return { containerNo, sealNo, containerTypeId: input.containerTypeId, grossWeightKg, volumeCbm };
}

/** Tambah atau ubah container pada job. Nomor container harus unik dalam satu job. */
export async function saveJobContainer(db: PrismaClient, jobId: string, input: ContainerInput) {
  const v = validateJobContainerInput(input);
  const type = await db.containerType.findUnique({ where: { id: v.containerTypeId }, select: { id: true, isActive: true } });
  if (!type || !type.isActive) throw new Error("Tipe container tidak ditemukan atau nonaktif.");

  const dup = await db.jobContainer.findFirst({
    where: { jobId, containerNo: v.containerNo, ...(input.id ? { id: { not: input.id } } : {}) },
    select: { id: true },
  });
  if (dup) throw new Error(`Container ${v.containerNo} sudah ada di job ini.`);

  const data = {
    containerNo: v.containerNo,
    sealNo: v.sealNo,
    containerTypeId: v.containerTypeId,
    grossWeightKg: v.grossWeightKg === null ? null : new Prisma.Decimal(v.grossWeightKg),
    volumeCbm: v.volumeCbm === null ? null : new Prisma.Decimal(v.volumeCbm),
  };
  if (input.id) {
    const existing = await db.jobContainer.findFirst({ where: { id: input.id, jobId }, select: { id: true } });
    if (!existing) throw new Error("Container tidak ditemukan di job ini.");
    return db.jobContainer.update({ where: { id: input.id }, data, select: { id: true, containerNo: true } });
  }
  return db.jobContainer.create({ data: { jobId, ...data }, select: { id: true, containerNo: true } });
}

/** Hapus container dari job. */
export async function deleteJobContainer(db: PrismaClient, jobId: string, containerId: string) {
  const existing = await db.jobContainer.findFirst({ where: { id: containerId, jobId }, select: { id: true, containerNo: true } });
  if (!existing) throw new Error("Container tidak ditemukan di job ini.");
  await db.jobContainer.delete({ where: { id: containerId } });
  return existing;
}
