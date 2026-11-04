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

export const dynamic = "force-dynamic";

export default async function RateCardPage() {
  const user = await requireCan("charges", "read");
  const canWrite = can(user.role, "charges", "write");
  const [items, charges, containerTypes] = await Promise.all([
    prisma.rateCardItem.findMany({ include: { chargeCode: true, containerType: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.chargeCode.findMany({ where: { isActive: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
    prisma.containerType.findMany({ where: { isActive: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
  ]);
  const chargeOpts = charges.map((c) => ({ id: c.id, label: `${c.code} · ${c.name}` }));
  const typeOpts = containerTypes.map((t) => ({ id: t.id, label: `${t.code} · ${t.name}` }));

  return (
    <div className="space-y-6">
      <PageHeader title="Rate Card" description="Tarif jual standar untuk menghitung selling charge job otomatis dari container, jalur, dan jarak">
        {canWrite && <RateCardForm charges={chargeOpts} containerTypes={typeOpts} />}
      </PageHeader>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Charge</TableHead><TableHead>Seksi invoice</TableHead><TableHead>Dasar hitung</TableHead><TableHead>Container</TableHead>
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
                  <TableCell className="text-xs text-muted-foreground">{r.chargeCode.invoiceSection ? SECTION_LABELS[r.chargeCode.invoiceSection] : "-"}</TableCell>
                  <TableCell className="text-sm">{BASIS_LABELS[r.basis]}{r.basis === "PER_KM_OVER" && r.thresholdKm != null ? ` (> ${r.thresholdKm} km)` : ""}</TableCell>
                  <TableCell>{r.basis === "PER_BL" ? "-" : r.containerType?.code ?? "Semua"}</TableCell>
                  <TableCell className="text-sm">{CONDITION_LABELS[r.condition]}</TableCell>
                  <TableCell className="text-right tabular-nums">{Number(r.price) > 0 ? formatIDR(Number(r.price)) : "Aktual"}</TableCell>
                  <TableCell className="max-w-56 text-xs text-muted-foreground">{r.note ?? ""}</TableCell>
                  {canWrite && (
                    <TableCell className="text-right">
                      <RateCardForm charges={chargeOpts} containerTypes={typeOpts} initial={{
                        id: r.id, chargeCodeId: r.chargeCodeId, containerTypeId: r.containerTypeId, basis: r.basis, condition: r.condition,
                        price: Number(r.price), thresholdKm: r.thresholdKm, taxable: r.taxable, note: r.note ?? "", sortOrder: r.sortOrder, isActive: r.isActive,
                      }} />
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {items.length === 0 && <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">Rate card masih kosong.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
