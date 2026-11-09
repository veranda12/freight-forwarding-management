import { Printer } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatIDR } from "@/lib/format";
import type { DocVoucherSummary } from "@/lib/doc-vouchers";

/** Voucher yang dibuat dari satu invoice atau bill: nomor, baris/job, nilai, bukti bayar, dan cetak. */
export function DocVouchersCard({ vouchers, settled }: { vouchers: DocVoucherSummary[]; settled: boolean }) {
  if (vouchers.length === 0) return null;
  const total = vouchers.reduce((s, v) => s + v.total, 0);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Voucher</CardTitle>
        <span className={`text-xs font-medium ${settled ? "text-emerald-600" : "text-amber-600"}`}>{settled ? "Lunas" : "Belum lunas"}</span>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {vouchers.map((v) => (
          <div key={v.id} className="flex items-start justify-between gap-2 border-b pb-2 last:border-0 last:pb-0">
            <div className="min-w-0">
              <div className="font-medium">{v.number}</div>
              <div className="text-xs text-muted-foreground">
                {formatDate(v.date)} · {v.lineCount} baris{v.jobs ? ` · ${v.jobs}` : ""}{v.proofNumber ? ` · ${v.proofNumber}` : ""}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="tabular-nums">{formatIDR(v.total)}</span>
              <a href={`/api/vouchers/${v.id}/pdf`} target="_blank" rel="noopener" aria-label={`Print ${v.number}`} className="text-muted-foreground hover:text-foreground"><Printer className="h-4 w-4" /></a>
            </div>
          </div>
        ))}
        <div className="flex justify-between pt-1 text-xs text-muted-foreground"><span>Total voucher</span><span className="tabular-nums">{formatIDR(total)}</span></div>
      </CardContent>
    </Card>
  );
}
