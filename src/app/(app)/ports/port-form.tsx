"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { savePortAction, saveAirportAction } from "./actions";

type Initial = { id: string; code: string; name: string; city: string | null; country: string };

/** Dialog tambah (tanpa initial) atau ubah (dengan initial) untuk seaport dan airport. */
export function PortForm({ kind, initial }: { kind: "port" | "airport"; initial?: Initial }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(initial?.code ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [city, setCity] = useState(initial?.city ?? "");
  const [country, setCountry] = useState(initial?.country ?? "");
  const isPort = kind === "port";
  const label = isPort ? "Seaport" : "Airport";

  function save() {
    start(async () => {
      const payload = { id: initial?.id, name, city, country };
      const res = isPort
        ? await savePortAction({ ...payload, unlocode: code })
        : await saveAirportAction({ ...payload, iata: code });
      if (res.ok) {
        toast.success(`${label} ${code.toUpperCase()} tersimpan.`);
        setOpen(false);
        if (!initial) { setCode(""); setName(""); setCity(""); setCountry(""); }
        router.refresh();
      } else toast.error(res.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {initial
          ? <Button size="sm" variant="ghost"><Pencil /> Ubah</Button>
          : <Button size="sm" variant="outline"><Plus /> Tambah {label}</Button>}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{initial ? `Ubah ${label} ${initial.code}` : `Tambah ${label}`}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>{isPort ? "Kode UN/LOCODE (5 huruf)" : "Kode IATA (3 huruf)"}</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder={isPort ? "IDTPP" : "CGK"} maxLength={5} />
          </div>
          <div className="space-y-1.5"><Label>Negara (kode 2 huruf atau nama)</Label><Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="ID" /></div>
          <div className="col-span-2 space-y-1.5"><Label>Nama</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder={isPort ? "Tanjung Priok" : "Soekarno-Hatta"} /></div>
          <div className="col-span-2 space-y-1.5"><Label>Kota (opsional)</Label><Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Jakarta" /></div>
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="ghost">Batal</Button></DialogClose>
          <Button onClick={save} disabled={pending || !code || !name || !country}>
            {pending ? <Loader2 className="animate-spin" /> : null} Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
