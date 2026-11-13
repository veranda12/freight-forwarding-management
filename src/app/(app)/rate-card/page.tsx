import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { formatIDR } from "@/lib/format";
import { BASIS_LABELS, CONDITION_LABELS, SECTION_LABELS } from "@/lib/enums";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RateCardForm } from "./rate-card-form";
import { CityFilter, CustomerFilter } from "./customer-filter";

export const dynamic = "force-dynamic";

/**
 * `?customer=std` tarif standar saja, `?customer=<id>` tarif khusus customer itu, kosong semua tarif.
 * `?city=none` tarif tanpa kota, `?city=<kota>` tarif kota itu.
 */
export default async function RateCardPage({ searchParams }: { searchParams: Promise<{ customer?: string; city?: string }> }) {
  const user = await requireCan("charges", "read");
  const canWrite = can(user.role, "charges", "write");
  const { customer: filter = "all", city: cityFilter = "all" } = await searchParams;
  const where = {
    ...(filter === "std" ? { customerId: null } : filter !== "all" ? { customerId: filter } : {}),
    ...(cityFilter === "none" ? { city: null } : cityFilter !== "all" ? { city: cityFilter } : {}),
  };
  const [rows, charges, containerTypes, customers, ports] = await Promise.all([
    prisma.rateCardItem.findMany({
      where, include: { chargeCode: true, containerType: true, customer: { select: { code: true, name: true } } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.chargeCode.findMany({ where: { isActive: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
    prisma.containerType.findMany({ where: { isActive: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
    prisma.customer.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, code: true, name: true } }),
    prisma.port.findMany({ where: { country: { in: ["Indonesia", "ID"] }, city: { not: null } }, select: { city: true } }),
  ]);
  // Pilihan kota: kota pelabuhan Indonesia di master Port, ditambah kota yang sudah dipakai tarif.
  const cities = [...new Set([...ports.map((p) => p.city!), ...rows.flatMap((r) => (r.city ? [r.city] : []))])].sort((a, b) => a.localeCompare(b));
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
        {canWrite && <RateCardForm charges={chargeOpts} containerTypes={typeOpts} customers={customerOpts} cities={cities} defaultCustomerId={pickedCustomer} defaultCity={pickedCity} />}
      </PageHeader>
      <div className="flex flex-col gap-2 sm:flex-row">
        <CustomerFilter value={filter} customers={customerOpts} city={cityFilter} />
        <CityFilter value={cityFilter} cities={cities} customer={filter} />
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
                  <TableCell className="text-sm">{r.city ?? <span className="text-muted-foreground">Semua</span>}</TableCell>
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
