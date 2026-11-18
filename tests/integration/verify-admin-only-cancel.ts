/**
 * Batal/hapus transaksi khusus Admin (permintaan client 17 Nov) di Role Management: izin dibaca dari role di DB,
 * sama seperti getCurrentUser. Finance/Operation bawaan tanpa izin batal; Admin dan Super Admin memegangnya;
 * role kustom yang diberi izin batal oleh Super Admin boleh membatalkan. Penolakan di server action dibuktikan E2E
 * (e2e/qa/qa-07-admin-only-cancel.spec.ts, replay aksi).
 * Hanya untuk database UJI: menolak "ffms" dan "ffms_pgcheck". Role uji dihapus di akhir.
 * Jalankan: DATABASE_URL=.../ffms_role_int npx tsx tests/integration/verify-admin-only-cancel.ts
 */
import { PrismaClient } from "@prisma/client";
import { PRISMA_CLIENT_OPTIONS } from "../../src/lib/prisma-options";
import { hasPerm, sessionFromUser, type SessionUser } from "../../src/lib/auth-helpers";
import type { PermissionKey } from "../../src/lib/permissions";
import { entryActions, type ActionEntry } from "../../src/lib/proof-lines";
import { createRole, deleteRole } from "../../src/lib/roles";

const db = new PrismaClient(PRISMA_CLIENT_OPTIONS);
let failures = 0;
const ok = (c: boolean, msg: string) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) failures++; };

const CANCEL: PermissionKey[] = [
  "invoices.cancel", "bills.cancel", "vouchers.cancel", "payments.cancel", "cashEntry.cancel", "cashEntry.transferCancel",
  "manualJournal.cancel", "tax.cancel", "jobs.cancel", "jobs.statusBack", "closing.reopenMonth",
];

async function sessionOf(email: string): Promise<SessionUser> {
  return sessionFromUser(await db.user.findUniqueOrThrow({ where: { email }, include: { appRole: true } }));
}

const entry = (source: ActionEntry["source"], sourceId: string | null = "x"): ActionEntry =>
  ({ id: "je", source, sourceId, isReversal: false, isReversed: false });

async function main() {
  const dbName = (await db.$queryRaw<{ d: string }[]>`SELECT DATABASE() AS d`)[0].d;
  if (dbName === "ffms" || dbName === "ffms_pgcheck") throw new Error(`Jangan jalankan uji ini di database ${dbName}.`);
  console.log(`   database: ${dbName}`);
  let customId: string | null = null;

  try {
    const fin = await sessionOf("finance@demo.com");
    const ops = await sessionOf("ops@demo.com");
    const adm = await sessionOf("admin@demo.com");
    const sup = await sessionOf("superadmin@demo.com");

    // 1. Izin efektif dari DB
    ok(CANCEL.every((k) => !hasPerm(fin, k)), "Finance (role di DB): tanpa izin batal/buka bulan/mundur status");
    ok(CANCEL.every((k) => !hasPerm(ops, k)), "Operation (role di DB): tanpa izin batal job dan izin batal lain");
    ok(hasPerm(ops, "domestic.cancel"), "Operation tetap boleh batal STT (di luar keputusan client)");
    ok(CANCEL.every((k) => hasPerm(adm, k)), "Admin: semua izin batal");
    ok(CANCEL.every((k) => hasPerm(sup, k)), "Super Admin: semua izin batal (dulu cek role === ADMIN memblokirnya)");
    ok(["invoices.edit", "bills.edit", "bills.pay", "invoices.receipt", "vouchers.create", "cashEntry.edit", "closing.lockPeriod"]
      .every((k) => hasPerm(fin, k as PermissionKey)), "Finance tetap mencatat, mengedit, dan closing bulan");

    // 2. Cari Bukti mengikuti izin yang sama
    const kinds: [ActionEntry["source"], string][] = [
      ["INVOICE", "invoice"], ["BILL", "bill"], ["RECEIPT", "receipt"], ["PAYMENT", "vendorPayment"], ["CASH_ENTRY", "cashEntry"],
      ["BANK_TRANSFER", "transfer"], ["VOUCHER", "voucher"], ["TAX_REMIT", "tax"],
    ];
    ok(kinds.every(([s]) => entryActions(entry(s), fin).cancel === null), "Cari Bukti: Finance tanpa tombol batal di semua jenis bukti");
    ok(kinds.every(([s, c]) => entryActions(entry(s), sup).cancel === c), "Cari Bukti: Super Admin punya tombol batal di semua jenis bukti");
    ok(entryActions(entry("INVOICE"), fin).editHref === "/invoices/x/edit", "Cari Bukti: Finance tetap bisa edit invoice");

    // 3. Role kustom: Super Admin memberi izin batal pelunasan saja
    const r = await createRole(db, { name: `Uji Batal ${Date.now()}`, permissions: ["payments.view", "payments.cancel"] });
    customId = r.id;
    const holder = { permissions: new Set<PermissionKey>((r.permissions as string[]) as PermissionKey[]) };
    ok(entryActions(entry("RECEIPT"), holder).cancel === "receipt", "role kustom dengan payments.cancel: boleh batal pelunasan");
    ok(entryActions(entry("INVOICE"), holder).cancel === null, "role kustom tanpa invoices.cancel: tidak boleh batal invoice");

    // 4. Hasil migrasi pada role bawaan
    const roles = await db.appRole.findMany({ where: { key: { in: ["FINANCE", "OPERATION"] } } });
    for (const role of roles) {
      const p = role.permissions as string[];
      ok(!p.some((k) => /\.(cancel|cancelOwn|transferCancel|transferCancelOwn)$/.test(k) && !k.startsWith("domestic.")),
        `migrasi: ${role.key} tanpa izin batal transaksi (${p.length} izin)`);
    }
    const finRole = roles.find((x) => x.key === "FINANCE");
    ok(!!finRole && (finRole.permissions as string[]).includes("bills.edit"), "migrasi: Finance mendapat bills.edit");
  } finally {
    if (customId) await deleteRole(db, customId).catch(() => undefined);
  }

  console.log(failures ? `\n${failures} GAGAL` : "\nSemua lulus");
  if (failures) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
