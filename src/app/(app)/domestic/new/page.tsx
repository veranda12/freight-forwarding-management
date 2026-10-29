import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getWeightRules, toRuleOpt } from "@/lib/weight-rules";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { SttForm, type SttPrefill } from "./stt-form";
import type { PkgRow } from "../calc-ui";

export const dynamic = "force-dynamic";

export default async function NewSttPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireCan("domestic", "write", { redirectTo: "/domestic" });
  const sp = await searchParams;
  const [customers, tariffs, rules, vendors] = await Promise.all([
    prisma.customer.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, code: true, address: true, phone: true } }),
    prisma.domesticTariff.findMany({ where: { isActive: true }, orderBy: [{ originCity: "asc" }, { destCity: "asc" }] }),
    getWeightRules("DOMESTIC"),
    prisma.vendor.findMany({ where: { isActive: true, type: { in: ["TRUCKING", "SHIPPING_LINE", "AIRLINE"] } }, orderBy: { name: "asc" }, select: { id: true, name: true, type: true } }),
  ]);

  // prefill dari halaman Cek Tarif
  let rows: PkgRow[] | undefined;
  try { rows = sp.pk ? (JSON.parse(sp.pk) as PkgRow[]) : undefined; } catch { rows = undefined; }
  const prefill: SttPrefill = {
    mode: sp.mode, origin: sp.origin, dest: sp.dest, rows,
    declaredValue: sp.dv, insurancePct: sp.ins, packing: sp.pack,
  };

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2"><Link href="/domestic"><ArrowLeft /> Kembali</Link></Button>
        <PageHeader title="STT Baru" description="Surat Tanda Terima pengiriman domestik — harga dihitung otomatis dari tarif & aturan berat" />
      </div>
      <SttForm
        customers={customers.map((c) => ({ id: c.id, label: `${c.name} (${c.code})`, name: c.name, address: c.address ?? "", phone: c.phone ?? "" }))}
        tariffs={tariffs.map((t) => ({
          id: t.id, mode: t.mode, originCity: t.originCity, destCity: t.destCity,
          ratePerKg: Number(t.ratePerKg), minChargeKg: Number(t.minChargeKg), leadTimeMin: t.leadTimeMin, leadTimeMax: t.leadTimeMax,
        }))}
        rules={Object.values(rules).map(toRuleOpt)}
        vendors={vendors}
        prefill={prefill}
      />
    </div>
  );
}
