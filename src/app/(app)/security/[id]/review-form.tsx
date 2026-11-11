"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { REVIEW_LABELS, REVIEW_STATUSES } from "@/lib/security/types";
import { updateReviewAction } from "../actions";

export function ReviewForm({ eventId, status, note, canWrite }: { eventId: string; status: string; note: string; canWrite: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [s, setS] = useState(status);
  const [n, setN] = useState(note);

  function save() {
    start(async () => {
      const r = await updateReviewAction(eventId, s, n);
      if (r.ok) { toast.success("Status penanganan disimpan."); router.refresh(); }
      else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="rv-status">Status penanganan</Label>
        <select id="rv-status" value={s} onChange={(e) => setS(e.target.value)} disabled={!canWrite} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
          {REVIEW_STATUSES.map((v) => <option key={v} value={v}>{REVIEW_LABELS[v]}</option>)}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="rv-note">Catatan admin</Label>
        <Textarea id="rv-note" rows={4} maxLength={2000} value={n} onChange={(e) => setN(e.target.value)} disabled={!canWrite} placeholder="Tindak lanjut, mis. sudah konfirmasi ke user via telepon" />
      </div>
      {canWrite && <Button onClick={save} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Save />} Simpan</Button>}
    </div>
  );
}
