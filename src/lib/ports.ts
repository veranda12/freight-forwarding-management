import type { PrismaClient } from "@prisma/client";

export type PortInput = { id?: string; unlocode: string; name: string; city?: string; country: string };
export type AirportInput = { id?: string; iata: string; name: string; city?: string; country: string };

/** Validasi murni: UN/LOCODE 5 huruf (2 huruf negara + 3 huruf lokasi), contoh IDTPP. */
export function validatePortInput(input: PortInput) {
  const unlocode = (input.unlocode ?? "").trim().toUpperCase();
  const name = (input.name ?? "").trim();
  const country = (input.country ?? "").trim();
  if (!/^[A-Z]{5}$/.test(unlocode)) throw new Error("Kode seaport (UN/LOCODE) harus 5 huruf, contoh IDTPP.");
  if (name.length < 2) throw new Error("Nama port minimal 2 karakter.");
  if (country.length < 2) throw new Error("Negara wajib diisi.");
  return { unlocode, name, country, city: (input.city ?? "").trim() || null };
}

/** Validasi murni: kode IATA airport 3 huruf, contoh CGK. */
export function validateAirportInput(input: AirportInput) {
  const iata = (input.iata ?? "").trim().toUpperCase();
  const name = (input.name ?? "").trim();
  const country = (input.country ?? "").trim();
  if (!/^[A-Z]{3}$/.test(iata)) throw new Error("Kode airport (IATA) harus 3 huruf, contoh CGK.");
  if (name.length < 2) throw new Error("Nama airport minimal 2 karakter.");
  if (country.length < 2) throw new Error("Negara wajib diisi.");
  return { iata, name, country, city: (input.city ?? "").trim() || null };
}

export async function savePort(db: PrismaClient, input: PortInput) {
  const v = validatePortInput(input);
  const dup = await db.port.findUnique({ where: { unlocode: v.unlocode }, select: { id: true } });
  if (dup && dup.id !== input.id) throw new Error(`Kode ${v.unlocode} sudah dipakai port lain.`);
  if (input.id) {
    return db.port.update({ where: { id: input.id }, data: v, select: { id: true, unlocode: true, name: true } });
  }
  return db.port.create({ data: v, select: { id: true, unlocode: true, name: true } });
}

export async function saveAirport(db: PrismaClient, input: AirportInput) {
  const v = validateAirportInput(input);
  const dup = await db.airport.findUnique({ where: { iata: v.iata }, select: { id: true } });
  if (dup && dup.id !== input.id) throw new Error(`Kode ${v.iata} sudah dipakai airport lain.`);
  if (input.id) {
    return db.airport.update({ where: { id: input.id }, data: v, select: { id: true, iata: true, name: true } });
  }
  return db.airport.create({ data: v, select: { id: true, iata: true, name: true } });
}
