"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setAccrualStartAction } from "../actions";

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const label = (p: string) => `${MONTHS[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`;

/** Atur bulan mulai akrual akhir bulan. Job yang ditagih sebelum bulan ini tidak ikut diakrualkan. */
export function AccrualStartForm({ current, suggested, canEdit }: { current: string | null; suggested: string; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [value, setValue] = useState(current ?? suggested);

  function save(period: string | null) {
    start(async () => {
      const res = await setAccrualStartAction(period);
      if (res.ok) { toast.success(period ? `Akrual berlaku mulai ${label(period)}.` : "Akrual dinonaktifkan."); router.refresh(); }
      else toast.error(res.error);
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/20 px-4 py-3">
      <div className="space-y-1.5">
        <Label htmlFor="accrual-start">Akrual berlaku untuk job yang ditagih mulai bulan</Label>
        <Input id="accrual-start" type="month" className="w-48" value={value} onChange={(e) => setValue(e.target.value)} disabled={!canEdit || pending} />
      </div>
      {canEdit && (
        <>
          <Button size="sm" disabled={pending || !value || value === current} onClick={() => save(value)}>
            {pending && <Loader2 className="animate-spin" />} {current ? "Ubah" : "Aktifkan akrual"}
          </Button>
          {current && <Button size="sm" variant="ghost" disabled={pending} onClick={() => save(null)}>Nonaktifkan</Button>}
        </>
      )}
      <p className="w-full text-xs text-muted-foreground">
        {current
          ? `Aktif mulai ${label(current)}. Biaya dari job yang ditagih sebelum ${label(current)} tidak ikut, rapikan manual lewat vendor bill di tanggal realnya.`
          : "Akrual belum aktif, jadi closing tidak membuat jurnal akrual. Pilih bulan mulainya, biasanya bulan pertama yang akan di-closing."}
      </p>
    </div>
  );
}
