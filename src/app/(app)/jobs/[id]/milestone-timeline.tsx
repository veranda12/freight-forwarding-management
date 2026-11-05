"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Circle, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toggleMilestone, addMilestone } from "../actions";

export type MilestoneItem = {
  id: string;
  title: string;
  note: string | null;
  plannedAt: string | null;
  actualAt: string | null;
  isDone: boolean;
};

export function MilestoneTimeline({
  jobId,
  items,
  canWrite,
}: {
  jobId: string;
  items: MilestoneItem[];
  canWrite: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const router = useRouter();
  // Status centang dipegang lokal (optimistic) dan disinkronkan dari server setiap props berubah. Sebelumnya toggle
  // menunggu transisi "server action + router.refresh()" yang tidak pernah selesai: tampilan tidak berubah dan tombol
  // terkunci, sehingga klik berikutnya bisa membalik data tanpa terlihat (D-09).
  const [list, setList] = useState(items);
  const [busyId, setBusyId] = useState<string | null>(null);
  useEffect(() => setList(items), [items]);

  async function toggle(id: string, done: boolean) {
    if (!canWrite || busyId) return;
    const now = new Date().toISOString();
    setBusyId(id);
    setList((ls) => ls.map((m) => (m.id === id ? { ...m, isDone: done, actualAt: done ? now : null } : m)));
    try {
      await toggleMilestone(id, done);
      router.refresh();
    } catch {
      setList((ls) => ls.map((m) => (m.id === id ? { ...m, isDone: !done, actualAt: items.find((x) => x.id === id)?.actualAt ?? null } : m)));
      toast.error("Gagal memperbarui milestone.");
    } finally {
      setBusyId(null);
    }
  }

  async function add() {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      await addMilestone(jobId, title.trim());
      setTitle("");
      setAdding(false);
      toast.success("Milestone ditambahkan.");
      router.refresh();
    } catch {
      toast.error("Gagal menambah milestone.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <ol className="relative space-y-0">
        {list.map((m, i) => (
          <li key={m.id} className="flex gap-3 pb-5 last:pb-0">
            <div className="flex flex-col items-center">
              <button
                onClick={() => toggle(m.id, !m.isDone)}
                disabled={!canWrite || busyId !== null}
                aria-pressed={m.isDone}
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                  m.isDone ? "border-success bg-success text-success-foreground" : "border-muted-foreground/30 bg-background text-muted-foreground",
                  canWrite && "hover:border-success cursor-pointer"
                )}
              >
                {m.isDone ? <Check className="h-4 w-4" /> : <Circle className="h-2.5 w-2.5 fill-current" />}
              </button>
              {i < list.length - 1 && <div className={cn("w-0.5 flex-1 mt-1", m.isDone ? "bg-success/40" : "bg-border")} />}
            </div>
            <div className="flex-1 pt-0.5">
              <p className={cn("text-sm font-medium", !m.isDone && "text-muted-foreground")}>{m.title}</p>
              <p className="text-xs text-muted-foreground">
                {m.actualAt ? `Aktual: ${formatDateTime(m.actualAt)}` : m.plannedAt ? `Rencana: ${formatDateTime(m.plannedAt)}` : "Belum terjadwal"}
              </p>
              {m.note && <p className="mt-0.5 text-xs text-muted-foreground italic">{m.note}</p>}
            </div>
          </li>
        ))}
      </ol>

      {canWrite && (
        adding ? (
          <div className="flex gap-2">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Judul milestone…" onKeyDown={(e) => e.key === "Enter" && add()} />
            <Button size="sm" onClick={add} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : "Simpan"}</Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Batal</Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}><Plus /> Tambah Milestone</Button>
        )
      )}
    </div>
  );
}
