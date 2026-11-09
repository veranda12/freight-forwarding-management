import { Printer } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatIDR } from "@/lib/format";
import type { DocVoucherSummary } from "@/lib/doc-vouchers";

/**
 * Voucher yang dibuat dari satu invoice atau bill: nomor, baris/job, nilai, dan cetak.
 * Voucher hanya catatan, jadi tidak ada status pelunasan di sini; yang dibatalkan ditandai dan tidak ikut total.
 */
export function DocVouchersCard({ vouchers }: { vouchers: DocVoucherSummary[] }) {
  if (vouchers.length === 0) return null;
  const total = vouchers.filter((v) => !v.cancelled).reduce((s, v) => s + v.total, 0);
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Voucher</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-sm">
        {vouchers.map((v) => (
          <div key={v.id} className={`flex items-start justify-between gap-2 border-b pb-2 last:border-0 last:pb-0 ${v.cancelled ? "opacity-60" : ""}`}>
            <div className="min-w-0">
              <div className="font-medium">{v.number}{v.cancelled && <span className="ml-1.5 text-xs font-normal text-destructive">Dibatalkan</span>}</div>
              <div className="text-xs text-muted-foreground">
                {v.cancelled
                  ? `${formatDate(v.date)}${v.cancelReason ? ` · ${v.cancelReason}` : ""}`
                  : `${formatDate(v.date)} · ${v.lineCount} baris${v.jobs ? ` · ${v.jobs}` : ""}${v.proofNumber ? ` · ${v.proofNumber}` : ""}`}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`tabular-nums ${v.cancelled ? "line-through" : ""}`}>{formatIDR(v.total)}</span>
              <a href={`/api/vouchers/${v.id}/pdf`} target="_blank" rel="noopener" aria-label={`Print ${v.number}`} className="text-muted-foreground hover:text-foreground"><Printer className="h-4 w-4" /></a>
            </div>
          </div>
        ))}
        <div className="flex justify-between pt-1 text-xs text-muted-foreground"><span>Total voucher aktif</span><span className="tabular-nums">{formatIDR(total)}</span></div>
      </CardContent>
    </Card>
  );
}
