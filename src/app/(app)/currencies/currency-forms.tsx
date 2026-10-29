"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addCurrencyAction, addRateAction } from "./actions";

export function CurrencyForms({ foreign }: { foreign: { code: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const today = new Date().toISOString().slice(0, 10);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [cur, setCur] = useState(foreign[0]?.code ?? "");
  const [date, setDate] = useState(today);
  const [rate, setRate] = useState("");

  function saveCurrency() {
    start(async () => {
      const res = await addCurrencyAction({ code, name, symbol });
      if (res.ok) {
        toast.success(`Mata uang ${code.toUpperCase()} ditambahkan.`);
        setCode(""); setName(""); setSymbol("");
        router.refresh();
      } else toast.error(res.error);
    });
  }

  function saveRate() {
    start(async () => {
      const res = await addRateAction({ currency: cur, date, rate: Number(rate) });
      if (res.ok) {
        toast.success(`Kurs ${cur} tanggal ${date} tersimpan.`);
        setRate("");
        router.refresh();
      } else toast.error(res.error);
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3 rounded-lg border p-4">
        <div className="text-sm font-semibold">Tambah mata uang</div>
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1.5"><Label>Kode</Label><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="AUD" maxLength={3} /></div>
          <div className="space-y-1.5"><Label>Nama</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Australian Dollar" /></div>
          <div className="space-y-1.5"><Label>Simbol</Label><Input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="A$" /></div>
        </div>
        <Button size="sm" variant="outline" onClick={saveCurrency} disabled={pending || !code || !name}>
          {pending ? <Loader2 className="animate-spin" /> : <Plus />} Tambah mata uang
        </Button>
      </div>
      <div className="space-y-3 rounded-lg border p-4">
        <div className="text-sm font-semibold">Tambah kurs manual (IDR per 1 unit)</div>
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1.5"><Label>Mata uang</Label>
            <Select value={cur} onValueChange={setCur}>
              <SelectTrigger><SelectValue placeholder="Pilih" /></SelectTrigger>
              <SelectContent>{foreign.map((c) => <SelectItem key={c.code} value={c.code}>{c.code} · {c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Tanggal</Label><Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Kurs (IDR)</Label><Input type="number" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="16000" /></div>
        </div>
        <Button size="sm" variant="outline" onClick={saveRate} disabled={pending || !cur || !rate || !date}>
          {pending ? <Loader2 className="animate-spin" /> : <Plus />} Simpan kurs
        </Button>
        <p className="text-xs text-muted-foreground">Kalau tanggal itu sudah punya kurs, nilainya diganti.</p>
      </div>
    </div>
  );
}
