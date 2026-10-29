/**
 * Uji tambah dan ubah port & airport (JANGAN dijalankan di database demo). Data uji dihapus di akhir.
 */
import { PrismaClient } from "@prisma/client";
import { savePort, saveAirport } from "../../src/lib/ports";

const db = new PrismaClient();
let failures = 0;
const ok = (c: boolean, msg: string) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) failures++; };

async function main() {
  const p = await savePort(db, { unlocode: "idzzz", name: "Pelabuhan Uji", country: "ID", city: "Uji" });
  ok(p.unlocode === "IDZZZ", "port baru tersimpan dengan kode huruf besar");
  const p2 = await savePort(db, { id: p.id, unlocode: "IDZZZ", name: "Pelabuhan Uji Ubah", country: "ID" });
  ok(p2.name === "Pelabuhan Uji Ubah", "port berhasil diubah");
  try { await savePort(db, { unlocode: "IDZ", name: "Salah", country: "ID" }); ok(false, "kode port salah ditolak"); }
  catch (e: any) { ok(/5 huruf/.test(e.message), `kode port 3 huruf ditolak: "${e.message}"`); }
  try { await savePort(db, { unlocode: "IDTPP", name: "Duplikat", country: "ID" }); ok(false, "kode port duplikat ditolak"); }
  catch (e: any) { ok(/sudah dipakai/.test(e.message), `kode port duplikat ditolak: "${e.message}"`); }

  const a = await saveAirport(db, { iata: "uzz", name: "Bandara Uji", country: "ID" });
  ok(a.iata === "UZZ", "airport baru tersimpan dengan kode huruf besar");
  const a2 = await saveAirport(db, { id: a.id, iata: "UZZ", name: "Bandara Uji Ubah", country: "ID" });
  ok(a2.name === "Bandara Uji Ubah", "airport berhasil diubah");
  try { await saveAirport(db, { iata: "CGKX", name: "Salah", country: "ID" }); ok(false, "kode airport 4 huruf ditolak"); }
  catch (e: any) { ok(/3 huruf/.test(e.message), `kode airport 4 huruf ditolak: "${e.message}"`); }
  try { await saveAirport(db, { iata: "CGK", name: "Duplikat", country: "ID" }); ok(false, "kode airport duplikat ditolak"); }
  catch (e: any) { ok(/sudah dipakai/.test(e.message), `kode airport duplikat ditolak: "${e.message}"`); }

  await db.port.delete({ where: { id: p.id } });
  await db.airport.delete({ where: { id: a.id } });
  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`);
}

main().catch((e) => { console.error("ERROR", e); failures++; }).finally(async () => { await db.$disconnect(); process.exitCode = failures ? 1 : 0; });
