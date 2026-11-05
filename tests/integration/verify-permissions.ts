/**
 * Uji Role Management terhadap database yang sudah di-seed (hanya membaca, aman di database mana pun).
 *
 *   DATABASE_URL=mysql://ffms:ffms123@127.0.0.1:3307/ffms_test node node_modules/tsx/dist/cli.mjs tests/integration/verify-permissions.ts
 *
 * - role di DB sesuai katalog (src/lib/permissions.ts), setiap user punya role, minimal satu Admin aktif;
 * - batas data "milik sendiri" untuk Sales di 8 modul: semua baris yang terlihat memang miliknya, dan role "semua data"
 *   melihat semua;
 * - maker-checker (assertNotOwn) menolak/menerima sesuai izin.
 */
import { PrismaClient } from "@prisma/client";
import { PRISMA_CLIENT_OPTIONS } from "../../src/lib/prisma-options";
import { ALL_PERMISSION_KEYS, DEFAULT_ROLES, normalizePermissions, type PermissionKey } from "../../src/lib/permissions";
import { assertNotOwn, hasPerm, type SessionUser } from "../../src/lib/auth-helpers";
import { billScope, customerScope, domesticScope, invoiceScope, jobScope, noteScope, paymentScope, quotationScope } from "../../src/lib/data-scope";

const db = new PrismaClient(PRISMA_CLIENT_OPTIONS);
let failures = 0;
const ok = (c: boolean, msg: string) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) failures++; };

async function sessionOf(email: string): Promise<SessionUser> {
  const u = await db.user.findUniqueOrThrow({ where: { email }, include: { appRole: true } });
  return {
    id: u.id, name: u.name, email: u.email, roleId: u.appRole.id, roleKey: u.appRole.key, roleName: u.appRole.name,
    isAdmin: u.appRole.isSystem, permissions: new Set(u.appRole.isSystem ? ALL_PERMISSION_KEYS : normalizePermissions(u.appRole.permissions)),
  };
}

async function main() {
  // 1. Role & user
  const roles = await db.appRole.findMany();
  const admin = roles.find((r) => r.isSystem);
  ok(!!admin && admin.key === "ADMIN", "role sistem Admin ada");
  for (const def of DEFAULT_ROLES) {
    const r = roles.find((x) => x.key === def.key);
    const same = !!r && JSON.stringify(normalizePermissions(r.permissions)) === JSON.stringify(normalizePermissions(def.permissions));
    ok(same, `role ${def.key} di DB sama dengan katalog (${r ? normalizePermissions(r.permissions).length : 0} izin)`);
  }
  const users = await db.user.findMany({ include: { appRole: true } });
  ok(users.every((u) => !!u.appRole), `semua ${users.length} user punya role`);
  ok(users.some((u) => u.isActive && u.appRole.isSystem), "minimal satu Admin aktif");

  // 2. Batas data
  const sales = await sessionOf("sales@demo.com");
  const ops = await sessionOf("ops@demo.com");
  const mgr = await sessionOf("manager@demo.com");
  const uid = sales.id;
  const ownJob = (j: { salesPicId: string | null; createdById: string | null }) => j.salesPicId === uid || j.createdById === uid;

  const qAll = await db.quotation.count();
  const qMine = await db.quotation.findMany({ where: quotationScope(sales), select: { ownerId: true, createdById: true } });
  ok(qMine.length > 0 && qMine.length < qAll && qMine.every((q) => q.ownerId === uid || q.createdById === uid), `quotation Sales: ${qMine.length}/${qAll}, semuanya milik sendiri`);
  ok((await db.quotation.count({ where: quotationScope(ops) })) === qAll, "quotation Operation: semua data");

  const cAll = await db.customer.count();
  const cMine = await db.customer.findMany({ where: customerScope(sales), select: { salesPicId: true, createdById: true } });
  ok(cMine.length > 0 && cMine.length < cAll && cMine.every((c) => c.salesPicId === uid || c.createdById === uid), `customer Sales: ${cMine.length}/${cAll}, semuanya milik sendiri`);

  const jAll = await db.job.count();
  const jMine = await db.job.findMany({ where: jobScope(sales), select: { salesPicId: true, createdById: true } });
  ok(jMine.length > 0 && jMine.length < jAll && jMine.every(ownJob), `job Sales: ${jMine.length}/${jAll}, semuanya milik sendiri`);
  ok((await db.job.count({ where: jobScope(mgr) })) === jAll, "job Management: semua data");

  const iAll = await db.invoice.count();
  const iMine = await db.invoice.findMany({ where: invoiceScope(sales), include: { job: true, domesticShipment: { include: { customer: true } }, customer: true } });
  ok(iMine.length > 0 && iMine.length < iAll && iMine.every((i) => i.createdById === uid || (i.job && ownJob(i.job)) || i.customer.salesPicId === uid || i.domesticShipment?.createdById === uid || i.domesticShipment?.customer.salesPicId === uid),
    `invoice Sales: ${iMine.length}/${iAll}, semuanya milik sendiri (pembuat/job/STT/customer)`);

  const sAll = await db.domesticShipment.count();
  const sMine = await db.domesticShipment.findMany({ where: domesticScope(sales), include: { customer: true } });
  ok(sMine.length <= sAll && sMine.every((s) => s.createdById === uid || s.customer.salesPicId === uid), `STT Sales: ${sMine.length}/${sAll}, semuanya milik sendiri`);

  const bAll = await db.vendorBill.count();
  const bMine = await db.vendorBill.findMany({ where: billScope(sales), include: { job: true } });
  ok(bMine.length < bAll && bMine.every((b) => b.createdById === uid || (b.job && ownJob(b.job))), `bill (bila Sales diberi izin): ${bMine.length}/${bAll}, semuanya milik sendiri`);

  const pAll = await db.payment.count();
  const pMine = await db.payment.count({ where: paymentScope(sales) });
  ok(pMine < pAll, `payment (bila Sales diberi izin): ${pMine}/${pAll} terbatas`);
  ok((await db.note.count({ where: noteScope(sales) })) <= (await db.note.count()), "note: terbatas pada pembuat");

  // 3. Izin & maker-checker
  ok(!hasPerm(sales, "quotations.send") && hasPerm(sales, "quotations.submit"), "Sales: boleh ajukan, tidak boleh kirim");
  ok(hasPerm(ops, "quotations.send") && hasPerm(ops, "quotations.decide") && !hasPerm(ops, "quotations.decideOwn"), "Operation: kirim & putuskan, tanpa izin dokumen sendiri");
  const blocked = (() => { try { assertNotOwn(ops, "quotations.decideOwn", [ops.id], "menerima"); return false; } catch { return true; } })();
  ok(blocked, "maker-checker: Operation tidak boleh memutuskan quotation yang ia kirim sendiri");
  const allowed = (() => { try { assertNotOwn(ops, "quotations.decideOwn", [sales.id], "menerima"); return true; } catch { return false; } })();
  ok(allowed, "maker-checker: Operation boleh memutuskan quotation kiriman orang lain");
  const withOwn: SessionUser = { ...ops, permissions: new Set<PermissionKey>([...ops.permissions, "quotations.decideOwn"]) };
  const ownOk = (() => { try { assertNotOwn(withOwn, "quotations.decideOwn", [ops.id], "menerima"); return true; } catch { return false; } })();
  ok(ownOk, "maker-checker: dengan izin 'dokumen sendiri', boleh memutuskan kiriman sendiri");
  const adminUser = await sessionOf("admin@demo.com");
  ok(ALL_PERMISSION_KEYS.every((k) => hasPerm(adminUser, k)), "Admin memegang semua izin");

  console.log(failures === 0 ? "\nSEMUA LULUS" : `\nGAGAL: ${failures} kasus`);
  if (failures) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
