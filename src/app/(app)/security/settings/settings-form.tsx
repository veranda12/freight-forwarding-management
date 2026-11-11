"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SEVERITIES, SEVERITY_LABELS } from "@/lib/security/types";
import type { SecuritySettings } from "@/lib/security/settings";
import { runRetentionAction, saveSecuritySettingsAction } from "../actions";

const NUM: { key: keyof SecuritySettings; label: string; hint: string; min: number; max: number }[] = [
  { key: "loginMaxFailures", label: "Login gagal per akun", hint: "Batas sebelum akun dibatasi sementara", min: 3, max: 50 },
  { key: "ipMaxFailures", label: "Login gagal per IP", hint: "Lebih longgar: satu IP kantor bisa dipakai banyak user", min: 5, max: 1000 },
  { key: "loginWindowMin", label: "Jendela hitung (menit)", hint: "Kegagalan dihitung dalam rentang ini", min: 1, max: 120 },
  { key: "loginBlockMin", label: "Lama pembatasan (menit)", hint: "Sementara, tidak ada kunci permanen", min: 1, max: 120 },
  { key: "retentionDays", label: "Retensi log (hari)", hint: "Event lebih tua dihapus saat cleanup", min: 7, max: 730 },
  { key: "notifyCooldownMin", label: "Cooldown notifikasi (menit)", hint: "Kejadian sama tidak dikirim ulang dalam rentang ini", min: 1, max: 1440 },
];

export function SettingsForm({ initial, canWrite }: { initial: SecuritySettings; canWrite: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [v, setV] = useState<Record<string, string>>(Object.fromEntries(Object.entries(initial).map(([k, x]) => [k, String(x)])));
  const set = (k: string, x: string) => setV((p) => ({ ...p, [k]: x }));

  function save() {
    start(async () => {
      const r = await saveSecuritySettingsAction(v);
      if (r.ok) {
        setV(Object.fromEntries(Object.entries(r.settings).map(([k, x]) => [k, String(x)])));
        toast.success("Konfigurasi keamanan disimpan.");
        router.refresh();
      } else toast.error(r.error);
    });
  }
  function cleanup() {
    start(async () => {
      const r = await runRetentionAction();
      if (r.ok) toast.success(`Cleanup selesai: ${r.events} event lebih dari ${r.retentionDays} hari dihapus.`);
      else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {NUM.map((f) => (
          <div key={f.key} className="space-y-1.5">
            <Label htmlFor={`s-${f.key}`}>{f.label}</Label>
            <Input id={`s-${f.key}`} type="number" min={f.min} max={f.max} value={v[f.key]} disabled={!canWrite} onChange={(e) => set(f.key, e.target.value)} />
            <p className="text-xs text-muted-foreground">{f.hint} ({f.min} sampai {f.max})</p>
          </div>
        ))}
        <div className="space-y-1.5">
          <Label htmlFor="s-mode">Mode deteksi SQLi/XSS</Label>
          <select id="s-mode" value={v.detectionMode} disabled={!canWrite} onChange={(e) => set("detectionMode", e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
            <option value="LOG_ONLY">Hanya catat (disarankan)</option>
            <option value="BLOCK">Catat dan tolak input</option>
          </select>
          <p className="text-xs text-muted-foreground">Tolak berlaku di pencarian global, form Customer, dan form Vendor.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="s-sev">Severity minimum notifikasi webhook</Label>
          <select id="s-sev" value={v.notifyMinSeverity} disabled={!canWrite} onChange={(e) => set("notifyMinSeverity", e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
            {SEVERITIES.map((s) => <option key={s} value={s}>{SEVERITY_LABELS[s]}</option>)}
          </select>
          <p className="text-xs text-muted-foreground">Hanya dipakai bila SECURITY_ALERT_WEBHOOK_URL diisi.</p>
        </div>
      </div>
      {canWrite && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Save />} Simpan konfigurasi</Button>
          <Button variant="outline" onClick={cleanup} disabled={pending}><Trash2 /> Jalankan cleanup retensi sekarang</Button>
        </div>
      )}
    </div>
  );
}
