/**
 * Uji Role Management terhadap database yang sudah di-seed (hanya membaca, aman di database mana pun).
 *
 *   DATABASE_URL=postgresql://…/ffms_part2 node node_modules/tsx/dist/cli.mjs tests/integration/verify-permissions.ts
 *
 * - role di DB sesuai katalog (src/lib/permissions.ts), setiap user punya role, minimal satu Super Admin aktif;
 * - Super Admin memegang semua izin, Admin semua kecuali Role Management (izin khusus Super Admin);
 * - batas data "milik sendiri" untuk Sales di 8 modul: semua baris yang terlihat memang miliknya, dan role "semua data"
 *   melihat semua;
 * - maker-checker (assertNotOwn) menolak/menerima sesuai izin.
 */
import { PrismaClient } from "@prisma/client";
import {
  ALL_PERMISSION_KEYS, DEFAULT_ROLES, SUPER_ADMIN_ONLY, normalizeCustomPermissions, type PermissionKey,
} from "../../src/lib/permissions";
import { assertNotOwn, hasPerm, sessionFromUser, type SessionUser } from "../../src/lib/auth-helpers";
import { billScope, customerScope, domesticScope, invoiceScope, jobScope, noteScope, paymentScope, quotationScope } from "../../src/lib/data-scope";

const db = new PrismaClient();
let failures = 0;
const ok = (c: boolean, msg: string) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) failures++; };

async function sessionOf(email: string): Promise<SessionUser> {
  const u = await db.user.findUniqueOrThrow({ where: { email }, include: { appRole: true } });
  return sessionFromUser(u);
}

async function main() {
  // 1. Role & user
  const roles = await db.appRole.findMany();
  const system = roles.filter((r) => r.isSystem).map((r) => r.key).sort();
  ok(JSON.stringify(system) === '["ADMIN","SUPER_ADMIN"]', `role sistem tepat Admin dan Super Admin (${system.join(", ")})`);
  for (const def of DEFAULT_ROLES) {
    const r = roles.find((x) => x.key === def.key);
    const same = !!r && JSON.stringify(normalizeCustomPermissions(r.permissions)) === JSON.stringify(normalizeCustomPermissions(def.permissions));
    ok(same, `role ${def.key} di DB sama dengan katalog (${r ? normalizeCustomPermissions(r.permissions).length : 0} izin)`);
    ok(!!r && !SUPER_ADMIN_ONLY.some((k) => normalizeCustomPermissions(r.permissions).includes(k)), `role ${def.key} tanpa izin Role Management`);
  }
  const users = await db.user.findMany({ include: { appRole: true } });
  ok(users.every((u) => !!u.appRole), `semua ${users.length} user punya role`);
  ok(users.some((u) => u.isActive && u.appRole.isSystem && u.appRole.key === "SUPER_ADMIN"), "minimal satu Super Admin aktif");

  // 2. Batas data
  const sales = await sessionOf("sales@demo.com");
  const ops = await sessionOf("ops@demo.com");
  const mgr = await sessionOf("manager@demo.com");
  const uid = sales.id;
  const ownJob = (j: { salesPicId: string | null; createdById: string | null }) => j.salesPicId === uid || j.createdById === uid;

  const qAll = await db.quotation.count();
  const qMine = await db.quotation.findMany({ where: quotationScope(sales), select: { ownerId: true, createdById: true } });
  ok(qMine.length > 0 && qMine.length < qAll && qMine.every((q) => q.ownerId === uid || q.createdById === uid), `quotation Sales: ${qMine.length}/${qAll}, semuanya milik sendiri`);
  ok((await db.quotation.count({ where: quotationScope(mgr) })) === qAll, "quotation Management: semua data");
  ok((await db.quotation.count({ where: quotationScope(ops) })) < qAll, "quotation Operation (SLG, tanpa izin quotation): tidak melihat semua data");

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
  // Aturan client SLG (5-6 Nov): Operation bawaan tanpa nilai tagihan, costing, dan quotation.
  ok(["costing.view", "reports.view", "rateCard.view", "jobs.charges", "quotations.view", "quotations.send"].every((k) => !hasPerm(ops, k as PermissionKey)),
    "Operation (SLG): tanpa costing, laporan, rate card, input biaya, dan quotation");
  // Maker-checker berlaku untuk role yang diberi izin kirim/putuskan quotation (mis. role kustom dari Operation).
  const checker: SessionUser = { ...ops, permissions: new Set<PermissionKey>([...ops.permissions, "quotations.view", "quotations.send", "quotations.decide"]) };
  ok(hasPerm(checker, "quotations.send") && hasPerm(checker, "quotations.decide") && !hasPerm(checker, "quotations.decideOwn"), "checker: kirim & putuskan, tanpa izin dokumen sendiri");
  const blocked = (() => { try { assertNotOwn(checker, "quotations.decideOwn", [checker.id], "menerima"); return false; } catch { return true; } })();
  ok(blocked, "maker-checker: checker tidak boleh memutuskan quotation yang ia kirim sendiri");
  const allowed = (() => { try { assertNotOwn(checker, "quotations.decideOwn", [sales.id], "menerima"); return true; } catch { return false; } })();
  ok(allowed, "maker-checker: checker boleh memutuskan quotation kiriman orang lain");
  const withOwn: SessionUser = { ...checker, permissions: new Set<PermissionKey>([...checker.permissions, "quotations.decideOwn"]) };
  const ownOk = (() => { try { assertNotOwn(withOwn, "quotations.decideOwn", [checker.id], "menerima"); return true; } catch { return false; } })();
  ok(ownOk, "maker-checker: dengan izin 'dokumen sendiri', boleh memutuskan kiriman sendiri");
  const adminUser = await sessionOf("admin@demo.com");
  const superUser = await sessionOf("superadmin@demo.com");
  ok(superUser.isSuperAdmin && ALL_PERMISSION_KEYS.every((k) => hasPerm(superUser, k)), "Super Admin memegang semua izin");
  ok(!adminUser.isSuperAdmin && ALL_PERMISSION_KEYS.filter((k) => !SUPER_ADMIN_ONLY.includes(k)).every((k) => hasPerm(adminUser, k)),
    "Admin memegang semua izin selain Role Management");
  ok(SUPER_ADMIN_ONLY.every((k) => !hasPerm(adminUser, k)), "Admin TIDAK memegang roles.view / roles.manage");
  const mgmt = await sessionOf("manager@demo.com");
  ok(!hasPerm(mgmt, "roles.view"), "Management (lihat semua modul) tetap tanpa Role Management");

  console.log(failures === 0 ? "\nSEMUA LULUS" : `\nGAGAL: ${failures} kasus`);
  if (failures) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
