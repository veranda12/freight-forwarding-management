"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { copyRateCardToCityAction } from "./actions";

const BASE = "__base__";
const OTHER = "__other__";

/**
 * Salin tarif ke kota lain (permintaan client 18 Nov): tarif Surabaya cukup disalin dari tarif dasar,
 * lalu hanya harga yang berbeda yang diubah. Tarif yang sudah ada di kota tujuan tidak ditimpa.
 */
export function CopyCityDialog({ cities, counts, defaultCity = null }: {
  /** Kota pelabuhan Indonesia di master Port, ditambah kota yang sudah dipakai tarif. */
  cities: string[];
  /** Jumlah tarif aktif per kota; kunci "" = tarif dasar (tanpa kota). */
  counts: Record<string, number>;
  defaultCity?: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(BASE);
  const [to, setTo] = useState(defaultCity ?? "");
  const [otherCity, setOtherCity] = useState("");
  const [withCustomer, setWithCustomer] = useState(true);
  const toCity = (to === OTHER ? otherCity : to).trim();
  const fromCity = from === BASE ? null : from;
  const sourceCount = counts[fromCity ?? ""] ?? 0;
  const sources = cities.filter((c) => (counts[c] ?? 0) > 0);

  function submit() {
    start(async () => {
      const res = await copyRateCardToCityAction({ fromCity, toCity, ...(withCustomer ? {} : { customerId: null }) });
      if (!res.ok) { toast.error(res.error); return; }
      toast.success(res.copied
        ? `${res.copied} tarif disalin ke ${toCity}${res.skipped ? `, ${res.skipped} dilewati karena sudah ada` : ""}. Silakan ubah harga yang berbeda.`
        : `Tidak ada yang disalin, semua tarif sudah ada di ${toCity}.`);
      setOpen(false);
      router.push(`/rate-card?city=${encodeURIComponent(toCity)}`);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { setFrom(BASE); setTo(defaultCity ?? ""); setOtherCity(""); setWithCustomer(true); } }}>
      <DialogTrigger asChild><Button variant="outline"><Copy /> Salin tarif ke kota</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Salin tarif ke kota</DialogTitle>
          <DialogDescription>
            Semua tarif aktif disalin ke kota tujuan dengan harga yang sama. Setelah itu cukup ubah harga yang berbeda di kota itu.
            Tarif yang sudah ada di kota tujuan tidak ditimpa.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label>Salin dari</Label>
            <Select value={from} onValueChange={setFrom}>
              <SelectTrigger aria-label="Salin dari"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={BASE}>Tarif dasar, semua kota ({counts[""] ?? 0} tarif)</SelectItem>
                {sources.map((c) => <SelectItem key={c} value={c}>Kota {c} ({counts[c]} tarif)</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Ke kota</Label>
            <Select value={to} onValueChange={setTo}>
              <SelectTrigger aria-label="Ke kota"><SelectValue placeholder="Pilih kota…" /></SelectTrigger>
              <SelectContent>
                {cities.filter((c) => c !== fromCity).map((c) => <SelectItem key={c} value={c}>Kota {c}</SelectItem>)}
                <SelectItem value={OTHER}>Kota lain…</SelectItem>
              </SelectContent>
            </Select>
            {to === OTHER && (
              <>
                <Input id="copy-other-city" value={otherCity} onChange={(e) => setOtherCity(e.target.value)} placeholder="Nama kota, mis. Batam" aria-label="Nama kota" />
                <p className="text-xs text-muted-foreground">
                  Tarif kota dipakai untuk job yang pelabuhannya di kota ini. Pastikan pelabuhannya ada di Master Data › Port &amp; Airport dengan kolom Kota yang sama persis.
                </p>
              </>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input id="copy-with-customer" type="checkbox" checked={withCustomer} onChange={(e) => setWithCustomer(e.target.checked)} className="h-4 w-4" />
            Ikut salin tarif khusus customer
          </label>
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="ghost">Batal</Button></DialogClose>
          <Button onClick={submit} disabled={pending || !toCity || sourceCount === 0}>{pending ? <Loader2 className="animate-spin" /> : <Copy />} Salin</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
