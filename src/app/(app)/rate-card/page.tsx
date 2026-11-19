import { requirePerm, hasPerm } from "@/lib/auth-helpers";
import { customerScope } from "@/lib/data-scope";
import { prisma } from "@/lib/prisma";
import { formatIDR } from "@/lib/format";
import { BASIS_LABELS, CONDITION_LABELS, SECTION_LABELS } from "@/lib/enums";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RateCardForm } from "./rate-card-form";
import Link from "next/link";
import { CustomerFilter } from "./customer-filter";
import { CopyCityDialog } from "./copy-city-dialog";

export const dynamic = "force-dynamic";

/**
 * `?customer=std` tarif standar saja, `?customer=<id>` tarif khusus customer itu, kosong semua tarif.
 * `?city=none` tarif tanpa kota, `?city=<kota>` tarif kota itu.
 */
export default async function RateCardPage({ searchParams }: { searchParams: Promise<{ customer?: string; city?: string }> }) {
  const user = await requirePerm("rateCard.view");
  const canWrite = hasPerm(user, "rateCard.edit");
  const { customer: filter = "all", city: cityFilter = "all" } = await searchParams;
  const where = {
    ...(filter === "std" ? { customerId: null } : filter !== "all" ? { customerId: filter } : {}),
    ...(cityFilter === "none" ? { city: null } : cityFilter !== "all" ? { city: cityFilter } : {}),
  };
  const [rows, charges, containerTypes, customers, ports, cityCounts] = await Promise.all([
    prisma.rateCardItem.findMany({
      // Tarif khusus customer hanya untuk customer dalam batas data user; tarif standar untuk semua.
      where: { AND: [where, { OR: [{ customerId: null }, { customer: customerScope(user) }] }] },
      include: { chargeCode: true, containerType: true, customer: { select: { code: true, name: true } } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.chargeCode.findMany({ where: { isActive: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
    prisma.containerType.findMany({ where: { isActive: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
    prisma.customer.findMany({ where: { isActive: true, ...customerScope(user) }, orderBy: { name: "asc" }, select: { id: true, code: true, name: true } }),
    prisma.port.findMany({ where: { country: { in: ["Indonesia", "ID"] }, city: { not: null } }, select: { city: true } }),
    prisma.rateCardItem.groupBy({
      by: ["city"], where: { isActive: true, ...(filter === "std" ? { customerId: null } : filter !== "all" ? { customerId: filter } : {}) }, _count: { _all: true },
    }),
  ]);
  // Jumlah tarif aktif per kota untuk tab kota; kunci "" = tarif dasar (tanpa kota).
  const counts: Record<string, number> = Object.fromEntries(cityCounts.map((c) => [c.city ?? "", c._count._all]));
  // Pilihan kota: kota pelabuhan Indonesia di master Port, ditambah kota yang sudah dipakai tarif.
  const cities = [...new Set([...ports.map((p) => p.city!), ...cityCounts.flatMap((c) => (c.city ? [c.city] : []))])].sort((a, b) => a.localeCompare(b));
  const cityHref = (v: string) => {
    const q = new URLSearchParams({ ...(filter !== "all" ? { customer: filter } : {}), ...(v !== "all" ? { city: v } : {}) }).toString();
    return q ? `/rate-card?${q}` : "/rate-card";
  };
  const tabs = [
    { v: "all", label: "Semua", n: null as number | null },
    { v: "none", label: "Tarif dasar", n: counts[""] ?? 0 },
    ...cities.map((c) => ({ v: c, label: c, n: counts[c] ?? 0 })),
  ];
  const pickedCity = cityFilter !== "all" && cityFilter !== "none" ? cityFilter : null;
  // Tarif standar dulu, lalu tarif khusus per customer (urut nama); di dalamnya tetap urut Urutan.
  const items = [...rows].sort((a, b) => (a.customer?.name ?? "").localeCompare(b.customer?.name ?? ""));
  const customerOpts = customers.map((c) => ({ id: c.id, label: `${c.name} (${c.code})` }));
  const pickedCustomer = filter !== "all" && filter !== "std" ? filter : null;
  const chargeOpts = charges.map((c) => ({ id: c.id, label: `${c.code} · ${c.name}` }));
  const typeOpts = containerTypes.map((t) => ({ id: t.id, label: `${t.code} · ${t.name}` }));

  return (
    <div className="space-y-6">
      <PageHeader title="Rate Card" description="Tarif jual untuk menghitung selling charge job otomatis dari container, jalur, dan jarak. Tarif khusus customer atau kota (kota pelabuhan job) menggantikan tarif standar yang setara">
        {canWrite && <CopyCityDialog cities={cities} counts={counts} defaultCity={pickedCity} />}
        {canWrite && <RateCardForm charges={chargeOpts} containerTypes={typeOpts} customers={customerOpts} cities={cities} defaultCustomerId={pickedCustomer} defaultCity={pickedCity} />}
      </PageHeader>
      <div className="space-y-3">
        <CustomerFilter value={filter} customers={customerOpts} city={cityFilter} />
        <nav aria-label="Kota" className="flex flex-wrap gap-1.5">
          {tabs.map((t) => (
            <Link key={t.v} href={cityHref(t.v)} aria-current={cityFilter === t.v ? "page" : undefined}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${cityFilter === t.v ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"} ${t.n === 0 && cityFilter !== t.v ? "text-muted-foreground" : ""}`}>
              {t.label}{t.n != null && <span className="ml-1.5 tabular-nums opacity-70">{t.n}</span>}
            </Link>
          ))}
        </nav>
        <p className="text-sm text-muted-foreground">
          {pickedCity
            ? <>Tarif khusus job yang pelabuhannya di <b className="text-foreground">{pickedCity}</b>. Charge yang tidak ada di sini memakai <Link href={cityHref("none")} className="text-primary hover:underline">tarif dasar</Link>.{(counts[pickedCity] ?? 0) === 0 && canWrite ? " Belum ada tarif kota ini. Pakai Salin tarif ke kota, lalu ubah harga yang berbeda." : ""}</>
            : cityFilter === "none"
              ? "Tarif dasar berlaku di semua kota, kecuali kota yang punya tarif sendiri untuk charge yang sama."
              : "Kota diambil dari pelabuhan job (impor: Port of Discharge, ekspor: Port of Loading). Tarif kota menggantikan tarif dasar yang setara."}
        </p>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Charge</TableHead><TableHead>Customer</TableHead><TableHead>Kota</TableHead><TableHead>Seksi invoice</TableHead><TableHead>Dasar hitung</TableHead><TableHead>Container</TableHead>
              <TableHead>Berlaku</TableHead><TableHead className="text-right">Tarif</TableHead><TableHead>Catatan</TableHead>
              {canWrite && <TableHead className="text-right">Aksi</TableHead>}
            </TableRow></TableHeader>
            <TableBody>
              {items.map((r) => (
                <TableRow key={r.id} className={r.isActive ? "" : "opacity-50"}>
                  <TableCell>
                    <span className="font-medium">{r.chargeCode.code}</span> <span className="text-muted-foreground">{r.chargeCode.name}</span>
                    {r.chargeCode.asReceipt && <Badge variant="outline" className="ml-1.5 text-[10px]">As receipt</Badge>}
                    {r.taxable && <Badge variant="outline" className="ml-1 text-[10px]">PPN</Badge>}
                  </TableCell>
                  <TableCell className="text-sm">{r.customer ? <span title={r.customer.name}>{r.customer.code}</span> : <span className="text-muted-foreground">Standar</span>}</TableCell>
                  <TableCell className="text-sm">{r.city ?? <span className="text-muted-foreground">Semua kota</span>}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.chargeCode.invoiceSection ? SECTION_LABELS[r.chargeCode.invoiceSection] : "-"}</TableCell>
                  <TableCell className="text-sm">{BASIS_LABELS[r.basis]}{r.basis === "PER_KM_OVER" && r.thresholdKm != null ? ` (> ${r.thresholdKm} km)` : ""}{r.basis === "OVERWEIGHT" && r.thresholdKg != null ? ` (> ${r.thresholdKg / 1000} ton)` : ""}</TableCell>
                  <TableCell>{r.basis === "PER_BL" ? "-" : r.containerType?.code ?? "Semua"}</TableCell>
                  <TableCell className="text-sm">{CONDITION_LABELS[r.condition]}</TableCell>
                  <TableCell className="text-right tabular-nums">{Number(r.price) > 0 ? formatIDR(Number(r.price)) : "Aktual"}</TableCell>
                  <TableCell className="max-w-56 text-xs text-muted-foreground">{r.note ?? ""}</TableCell>
                  {canWrite && (
                    <TableCell className="text-right">
                      <RateCardForm charges={chargeOpts} containerTypes={typeOpts} customers={customerOpts} cities={cities} initial={{
                        id: r.id, chargeCodeId: r.chargeCodeId, containerTypeId: r.containerTypeId, customerId: r.customerId, city: r.city, basis: r.basis, condition: r.condition,
                        price: Number(r.price), thresholdKm: r.thresholdKm, thresholdKg: r.thresholdKg, taxable: r.taxable, note: r.note ?? "", sortOrder: r.sortOrder, isActive: r.isActive,
                      }} />
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {items.length === 0 && <TableRow><TableCell colSpan={10} className="py-8 text-center text-sm text-muted-foreground">{filter === "all" && cityFilter === "all" ? "Rate card masih kosong." : "Tidak ada tarif untuk pilihan ini."}</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
