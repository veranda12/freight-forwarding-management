import type { PrismaClient, Prisma, TransportMode } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Teks rute quotation ditulis bebas, mis. "Jakarta (IDTPP)", "Los Angeles (USLAX)", atau "Shanghai".
 * Hasil: label (teks sebelum kurung) dan kode di dalam kurung (huruf/angka, 3–5 karakter) bila ada.
 */
export function parseRouteText(text: string | null | undefined): { label: string; code: string | null } | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  const m = t.match(/^(.*?)\s*\(\s*([A-Za-z0-9]{3,5})\s*\)\s*$/);
  if (m) return { label: m[1].trim(), code: m[2].toUpperCase() };
  return { label: t, code: null };
}

/** Satu-satunya id bila tepat satu kandidat; selain itu null (tidak menebak). */
const only = (rows: { id: string }[]) => (rows.length === 1 ? rows[0].id : null);

async function findPort(db: Db, text: string | null | undefined): Promise<string | null> {
  const p = parseRouteText(text);
  if (!p) return null;
  if (p.code) {
    const byCode = await db.port.findUnique({ where: { unlocode: p.code }, select: { id: true } });
    if (byCode) return byCode.id;
  }
  if (!p.label) return null;
  return only(await db.port.findMany({ where: { OR: [{ city: p.label }, { name: p.label }] }, select: { id: true }, take: 2 }));
}

async function findAirport(db: Db, text: string | null | undefined): Promise<string | null> {
  const p = parseRouteText(text);
  if (!p) return null;
  if (p.code && p.code.length === 3) {
    const byCode = await db.airport.findUnique({ where: { iata: p.code }, select: { id: true } });
    if (byCode) return byCode.id;
  }
  if (!p.label) return null;
  return only(await db.airport.findMany({ where: { OR: [{ city: p.label }, { name: p.label }] }, select: { id: true }, take: 2 }));
}

/**
 * Petakan rute teks quotation ke master Port (laut) atau Airport (udara) untuk job hasil convert (D-08).
 * Yang tidak cocok persis tetap kosong dan diisi manual di job.
 */
export async function resolveQuotationRoute(db: Db, mode: TransportMode, originText: string | null, destText: string | null) {
  if (mode === "SEA_FCL" || mode === "SEA_LCL") {
    return { polId: await findPort(db, originText), podId: await findPort(db, destText) };
  }
  if (mode === "AIR") {
    return { originAirportId: await findAirport(db, originText), destAirportId: await findAirport(db, destText) };
  }
  return {};
}
