import type { PrismaClient } from "@prisma/client";

export type VehicleInput = {
  id?: string;
  code: string;
  plate: string;
  type: string;
  capacityKg?: number | null;
  capacityCbm?: number | null;
  driverName?: string;
  notes?: string;
  isActive?: boolean;
};

/** Validasi murni data armada sendiri. Plat dan kode disimpan huruf besar tanpa spasi ganda. */
export function validateVehicleInput(input: VehicleInput) {
  const code = (input.code ?? "").trim().toUpperCase();
  const plate = (input.plate ?? "").trim().toUpperCase().replace(/\s+/g, " ");
  const type = (input.type ?? "").trim();
  if (!/^[A-Z0-9_-]{2,15}$/.test(code)) throw new Error("Kode armada 2 sampai 15 karakter: huruf, angka, strip, atau garis bawah. Contoh: TRK-01.");
  if (!/^[A-Z]{1,2} ?\d{1,4} ?[A-Z]{0,3}$/.test(plate)) throw new Error("Nomor polisi tidak valid. Contoh: B 9123 CD.");
  if (type.length < 2) throw new Error("Jenis armada wajib diisi, contoh: Truk box 4 ton.");
  const capacityKg = input.capacityKg == null || Number.isNaN(Number(input.capacityKg)) ? null : Number(input.capacityKg);
  const capacityCbm = input.capacityCbm == null || Number.isNaN(Number(input.capacityCbm)) ? null : Number(input.capacityCbm);
  if (capacityKg !== null && capacityKg < 0) throw new Error("Kapasitas (kg) tidak boleh negatif.");
  if (capacityCbm !== null && capacityCbm < 0) throw new Error("Kapasitas (cbm) tidak boleh negatif.");
  return {
    code, plate, type,
    capacityKg, capacityCbm,
    driverName: (input.driverName ?? "").trim() || null,
    notes: (input.notes ?? "").trim() || null,
    isActive: input.isActive ?? true,
  };
}

/** Menambah atau mengubah armada. Kode dan plat harus unik. */
export async function saveVehicle(db: PrismaClient, input: VehicleInput) {
  const v = validateVehicleInput(input);
  const dupCode = await db.vehicle.findUnique({ where: { code: v.code }, select: { id: true } });
  if (dupCode && dupCode.id !== input.id) throw new Error(`Kode armada ${v.code} sudah dipakai.`);
  const dupPlate = await db.vehicle.findUnique({ where: { plate: v.plate }, select: { id: true } });
  if (dupPlate && dupPlate.id !== input.id) throw new Error(`Plat ${v.plate} sudah terdaftar.`);
  if (input.id) {
    return db.vehicle.update({ where: { id: input.id }, data: v, select: { id: true, code: true, plate: true } });
  }
  return db.vehicle.create({ data: v, select: { id: true, code: true, plate: true } });
}
