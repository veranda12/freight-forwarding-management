import Link from "next/link";
import { FileClock } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { accrualCandidates, accrualReview, findAccrual, getAccrualStart, possibleMissingCosts, ACCRUED_AP, type AccrualReviewRow } from "@/lib/accrual";
import { AccrualStartForm } from "./accrual-start-form";
import { periodLabel } from "@/lib/period-lock";
import { formatIDR } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/**
 * Pratinjau jurnal akrual bulan yang akan di-closing, dan daftar periksa biaya yang mungkin belum diinput.
 * Akrual dibuat otomatis saat tombol Closing ditekan (lib/accrual.ts).
 */
export async function AccrualCard({ period, canEdit }: { period: string; canEdit: boolean }) {
  const startPeriod = await getAccrualStart(prisma);
  const active = !!startPeriod && period >= startPeriod;
  const [items, missing, existing] = await Promise.all([
    active ? accrualCandidates(prisma, period, startPeriod) : Promise.resolve([]),
    possibleMissingCosts(prisma, period), findAccrual(prisma, period),
  ]);
  const total = items.reduce((s, i) => s + i.amount, 0);
  const next = (() => { const y = Number(period.slice(0, 4)), m = Number(period.slice(5, 7)); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`; })();

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="flex items-center gap-2 text-base"><FileClock className="h-4 w-4" /> Akrual akhir bulan · {periodLabel(period)}</CardTitle>
        <p className="text-sm text-muted-foreground">
          Biaya job yang sudah ditagih ke customer tapi tagihan vendornya belum dicatat sampai akhir {periodLabel(period)}.
          Saat Closing, biaya ini dicatat sebagai beban {periodLabel(period)} (kredit {ACCRUED_AP} Hutang Belum Ditagih), lalu dibalik
          otomatis tanggal 1 {periodLabel(next)}. Tagihan asli tetap diinput seperti biasa di tanggal realnya.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <AccrualStartForm current={startPeriod} suggested={period} canEdit={canEdit} />
        {!startPeriod ? null : !active ? (
          <p className="text-sm text-muted-foreground">Akrual baru berlaku mulai {periodLabel(startPeriod)}, jadi closing {periodLabel(period)} tidak membuat jurnal akrual.</p>
        ) : existing ? (
          <p className="rounded-lg border bg-muted/30 px-4 py-2.5 text-sm">
            Akrual bulan ini sudah dibuat: <Link href={`/proofs?q=${encodeURIComponent(existing.number)}`} className="font-medium text-primary hover:underline">{existing.number}</Link>.
            Closing ulang setelah koreksi tidak membuat akrual baru.
          </p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Tidak ada biaya yang perlu diakrualkan. Semua biaya job yang sudah ditagih sudah punya vendor bill atau voucher.</p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm"><b>{items.length} biaya</b> akan diakrualkan, total <b className="tabular-nums">{formatIDR(total)}</b>.</p>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Job</TableHead><TableHead>Charge</TableHead><TableHead>Vendor</TableHead><TableHead>Keterangan</TableHead>
                  <TableHead>Akun</TableHead><TableHead className="text-right">Nilai</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {items.map((i) => (
                    <TableRow key={i.lineId}>
                      <TableCell>
                        <Link href={`/costing/${i.jobId}`} className="font-medium text-primary hover:underline">{i.jobNumber}</Link>
                        <div className="text-xs text-muted-foreground">{i.customer}</div>
                      </TableCell>
                      <TableCell><span className="font-medium">{i.charge}</span> <span className="text-muted-foreground">{i.chargeName}</span></TableCell>
                      <TableCell className="text-sm">{i.vendor ?? "-"}</TableCell>
                      <TableCell className="max-w-64 text-xs text-muted-foreground">{i.reason}{i.description ? ` · ${i.description}` : ""}</TableCell>
                      <TableCell className="text-sm tabular-nums">{i.accountCode}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatIDR(i.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-sm font-medium">Periksa sebelum closing: biaya yang mungkin belum diinput</p>
          {missing.length === 0 ? (
            <p className="text-sm text-muted-foreground">Semua job yang ditagih di {periodLabel(period)} sudah punya biaya yang biasanya ada.</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Job yang ditagih di {periodLabel(period)} tapi biayanya kelihatan belum lengkap. Kalau biayanya memang ada, isi
                perkiraannya di Buying supaya ikut diakrualkan. Daftar ini hanya pengingat dan tidak membuat jurnal.
              </p>
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Job</TableHead><TableHead>Invoice</TableHead><TableHead>Biaya yang belum ada di Buying</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {missing.map((m) => (
                      <TableRow key={m.jobId}>
                        <TableCell>
                          <Link href={`/costing/${m.jobId}`} className="font-medium text-primary hover:underline">{m.jobNumber}</Link>
                          <div className="text-xs text-muted-foreground">{m.customer}</div>
                        </TableCell>
                        <TableCell className="text-sm">{m.invoiceNumbers}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {m.noCost && <Badge variant="outline" className="border-warning/50 text-warning">Belum ada biaya sama sekali</Badge>}
                            {m.missing.map((c) => <Badge key={c} variant="outline">{c}</Badge>)}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ReviewTable({ rows }: { rows: AccrualReviewRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader><TableRow>
          <TableHead>Job</TableHead><TableHead>Charge</TableHead><TableHead>Vendor</TableHead><TableHead>Keterangan</TableHead>
          <TableHead className="text-right">Nilai</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={r.lineId ?? `x${i}`}>
              <TableCell>{r.jobId ? <Link href={`/costing/${r.jobId}`} className="font-medium text-primary hover:underline">{r.jobNumber}</Link> : r.jobNumber}</TableCell>
              <TableCell className="font-medium">{r.charge}</TableCell>
              <TableCell className="text-sm">{r.vendor ?? "-"}</TableCell>
              <TableCell className="max-w-72 text-xs text-muted-foreground">{r.note}</TableCell>
              <TableCell className="text-right tabular-nums">{formatIDR(r.amount)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * Pemeriksaan akrual bulan yang sedang dibuka untuk koreksi: biaya yang tercatat dua kali (akrual + bill/voucher di
 * bulan yang sama) dan biaya yang sekarang memenuhi syarat tapi tidak ikut akrual. Closing ulang tidak menghitung
 * ulang akrual, jadi selisihnya disesuaikan lewat Jurnal Umum.
 */
export async function AccrualReviewCard({ period }: { period: string }) {
  const review = await accrualReview(prisma, period);
  if (!review) return null;
  const sum = (rows: AccrualReviewRow[]) => rows.reduce((s, r) => s + r.amount, 0);
  const clean = !review.doubles.length && !review.missed.length;
  return (
    <Card className={clean ? undefined : "border-warning/50"}>
      <CardHeader className="space-y-1">
        <CardTitle className="flex items-center gap-2 text-base"><FileClock className="h-4 w-4" /> Pemeriksaan akrual · {periodLabel(period)}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {periodLabel(period)} sedang dibuka untuk koreksi. Akrualnya {review.entryNumber} ({formatIDR(review.accruedTotal)}) tidak dihitung ulang
          saat ditutup lagi, karena pembaliknya ada di bulan berikutnya. Kalau koreksi menyentuh biaya yang diakrualkan, sesuaikan lewat Jurnal Umum.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {clean && <p className="text-sm text-muted-foreground">Tidak ada selisih. Akrual bulan ini masih sesuai dengan kondisi sekarang.</p>}
        {review.doubles.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm"><b>Tercatat dua kali:</b> {review.doubles.length} biaya, {formatIDR(sum(review.doubles))}. Biaya ini ikut akrual dan sekarang juga punya bill atau voucher bertanggal {periodLabel(period)}.</p>
            <p className="text-xs text-muted-foreground">
              Paling rapi: ubah tanggal bill atau voucher ke tanggal real datangnya tagihan (bulan berikutnya). Kalau memang harus di {periodLabel(period)}, buat
              Jurnal Umum di {periodLabel(period)}: Dr {ACCRUED_AP} Hutang Belum Ditagih, Cr akun beban, sebesar nilai di bawah. Lalu di awal bulan berikutnya: Dr akun beban, Cr {ACCRUED_AP}.
            </p>
            <ReviewTable rows={review.doubles} />
          </div>
        )}
        {review.missed.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm"><b>Belum ikut akrual:</b> {review.missed.length} biaya, {formatIDR(sum(review.missed))}. Biaya ini sekarang memenuhi syarat akrual {periodLabel(period)} tapi tidak ikut saat closing.</p>
            <p className="text-xs text-muted-foreground">
              Kalau ingin masuk {periodLabel(period)}, buat Jurnal Umum di {periodLabel(period)}: Dr akun beban, Cr {ACCRUED_AP}. Lalu di awal bulan berikutnya: Dr {ACCRUED_AP}, Cr akun beban.
            </p>
            <ReviewTable rows={review.missed} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
