"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import type { GroupDef, PermKind } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createRoleAction, updateRoleAction } from "./actions";

const KIND_LABEL: Record<PermKind, string> = {
  view: "Menu", action: "Tombol", approve: "Persetujuan", own: "Dokumen sendiri", scope: "Semua data",
};
const KIND_VARIANT: Record<PermKind, "outline" | "default" | "warning" | "destructive" | "success"> = {
  view: "outline", action: "default", approve: "warning", own: "destructive", scope: "success",
};

type Props = {
  groups: GroupDef[];
  mode: "create" | "edit";
  roleId?: string;
  initial: { name: string; description: string; permissions: string[] };
  readOnly?: boolean;
};

export function RoleEditor({ groups, mode, roleId, initial, readOnly }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [perms, setPerms] = useState<Set<string>>(new Set(initial.permissions));
  const [filter, setFilter] = useState("");

  const initialSet = useMemo(() => new Set(initial.permissions), [initial.permissions]);
  const added = [...perms].filter((k) => !initialSet.has(k));
  const removed = [...initialSet].filter((k) => !perms.has(k));
  const labelOf = useMemo(() => new Map<string, string>(groups.flatMap((g) => g.modules.flatMap((m) => m.perms.map((p) => [p.key, `${m.label}: ${p.label}`] as const)))), [groups]);

  const toggle = (key: string, on: boolean, moduleKey: string) => {
    const next = new Set(perms);
    if (on) { next.add(key); next.add(`${moduleKey}.view`); }
    else {
      next.delete(key);
      // Melepas izin lihat menu melepas semua izin lain di modul itu.
      if (key === `${moduleKey}.view`) for (const k of [...next]) if (k.startsWith(`${moduleKey}.`)) next.delete(k);
    }
    setPerms(next);
  };
  const setModule = (keys: string[], on: boolean) => {
    const next = new Set(perms);
    for (const k of keys) {
      if (on) next.add(k);
      else next.delete(k);
    }
    setPerms(next);
  };

  const q = filter.trim().toLowerCase();
  const visibleGroups = groups
    .map((g) => ({ ...g, modules: g.modules.filter((m) => !q || m.label.toLowerCase().includes(q) || m.perms.some((p) => p.label.toLowerCase().includes(q))) }))
    .filter((g) => g.modules.length > 0);

  function save() {
    start(async () => {
      const input = { name, description, permissions: [...perms] };
      const res = mode === "create" ? await createRoleAction(input) : await updateRoleAction(roleId!, input);
      if (res.ok) {
        toast.success(mode === "create" ? "Role dibuat." : "Role disimpan. Perubahan langsung berlaku untuk user di role ini.");
        router.push("/roles");
        router.refresh();
      } else toast.error(res.error);
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Data role</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="r-name">Nama role</Label>
            <Input id="r-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} disabled={readOnly} placeholder="Mis. Sales Senior" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-filter">Cari izin</Label>
            <Input id="r-filter" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Mis. quotation, invoice, pajak" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="r-desc">Deskripsi</Label>
            <Textarea id="r-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={500} disabled={readOnly} />
          </div>
          <div className="text-xs text-muted-foreground sm:col-span-2">
            <Badge variant="outline">Menu</Badge> boleh membuka menu · <Badge>Tombol</Badge> boleh menjalankan aksi ·{" "}
            <Badge variant="warning">Persetujuan</Badge> kirim/terima/batal/posting · <Badge variant="destructive">Dokumen sendiri</Badge> boleh memproses
            dokumen yang ia buat/ajukan sendiri (maker-checker) · <Badge variant="success">Semua data</Badge> tanpa ini user hanya melihat data miliknya
            (Sales PIC atau pembuat).
          </div>
        </CardContent>
      </Card>

      {visibleGroups.map((g) => (
        <Card key={g.label}>
          <CardHeader><CardTitle className="text-base">{g.label}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {g.modules.map((m) => {
              const keys = m.perms.map((p) => p.key as string);
              const allOn = keys.every((k) => perms.has(k));
              return (
                <fieldset key={m.key} className="rounded-md border p-3" aria-label={`Izin ${m.label}`}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <legend className="text-sm font-semibold">{m.label}</legend>
                    {!readOnly && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => setModule(keys, !allOn)}>
                        {allOn ? "Kosongkan" : "Pilih semua"}
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {m.perms.map((p) => (
                      <label key={p.key} className="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" data-perm={p.key}
                          checked={perms.has(p.key)} disabled={readOnly}
                          onChange={(e) => toggle(p.key, e.target.checked, m.key)}
                        />
                        <span>
                          {p.label} <Badge variant={KIND_VARIANT[p.kind]} className="ml-1 align-middle text-[10px]">{KIND_LABEL[p.kind]}</Badge>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              );
            })}
          </CardContent>
        </Card>
      ))}

      {!readOnly && (
        <Card className="sticky bottom-2">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="text-sm">
              <span className="font-medium">{perms.size} izin dipilih.</span>{" "}
              {mode === "edit" && (added.length > 0 || removed.length > 0) && (
                <span className="text-muted-foreground" title={[...added.map((k) => `+ ${labelOf.get(k)}`), ...removed.map((k) => `- ${labelOf.get(k)}`)].join("\n")}>
                  Perubahan: +{added.length} / -{removed.length}
                </span>
              )}
            </div>
            <Button onClick={save} disabled={pending || name.trim().length < 2}>
              {pending ? <Loader2 className="animate-spin" /> : <Save />} Simpan role
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
