"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export type FieldConfig = {
  name: string;
  label: string;
  type?: "text" | "number" | "textarea" | "select" | "checkbox" | "email";
  options?: { value: string; label: string }[];
  placeholder?: string;
  step?: string;
  colSpan?: 1 | 2;
  help?: string;
  required?: boolean;
};

export type EntityActionResult = { ok: boolean; error?: string; redirect?: string };
export type EntityAction = (values: Record<string, unknown>) => Promise<EntityActionResult>;

export function EntityForm({
  fields,
  action,
  initial = {},
  backHref,
  submitLabel = "Simpan",
}: {
  fields: FieldConfig[];
  action: EntityAction;
  initial?: Record<string, unknown>;
  backHref: string;
  submitLabel?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const v: Record<string, unknown> = {};
    for (const f of fields) {
      v[f.name] = initial[f.name] ?? (f.type === "checkbox" ? false : f.type === "number" ? 0 : "");
    }
    return v;
  });

  function set(name: string, value: unknown) {
    setValues((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((e) => { const n = { ...e }; delete n[name]; return n; });
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    for (const f of fields) {
      if (f.required) {
        const v = values[f.name];
        const empty = v == null || (typeof v === "string" && v.trim() === "");
        if (empty) errs[f.name] = `${f.label} wajib diisi`;
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) { toast.error("Lengkapi field yang wajib diisi."); return; }
    start(async () => {
      const res = await action(values);
      if (res.ok) {
        toast.success("Tersimpan.");
        router.push(res.redirect ?? backHref);
        router.refresh();
      } else {
        toast.error(res.error ?? "Gagal menyimpan.");
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Card>
        <CardContent className="grid gap-4 p-5 sm:grid-cols-2">
          {fields.map((f) => (
            <div key={f.name} className={`space-y-1.5 ${f.colSpan === 2 ? "sm:col-span-2" : ""}`}>
              {f.type !== "checkbox" && <Label>{f.label}{f.required && <span className="ml-0.5 text-destructive">*</span>}</Label>}
              {f.type === "textarea" ? (
                <Textarea value={String(values[f.name] ?? "")} onChange={(e) => set(f.name, e.target.value)} placeholder={f.placeholder} />
              ) : f.type === "select" ? (
                <Select value={String(values[f.name] ?? "")} onValueChange={(v) => set(f.name, v)}>
                  <SelectTrigger><SelectValue placeholder={f.placeholder ?? "Pilih…"} /></SelectTrigger>
                  <SelectContent>
                    {f.options?.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : f.type === "checkbox" ? (
                <label className="flex items-center gap-2 pt-6 text-sm font-medium">
                  <input type="checkbox" checked={Boolean(values[f.name])} onChange={(e) => set(f.name, e.target.checked)} className="h-4 w-4 rounded border-input" />
                  {f.label}
                </label>
              ) : (
                <Input
                  type={f.type === "number" ? "number" : f.type === "email" ? "email" : "text"}
                  step={f.step}
                  value={String(values[f.name] ?? "")}
                  onChange={(e) => set(f.name, f.type === "number" ? e.target.value : e.target.value)}
                  placeholder={f.placeholder}
                />
              )}
              {errors[f.name] && <p className="text-xs text-destructive">{errors[f.name]}</p>}
              {f.help && !errors[f.name] && <p className="text-xs text-muted-foreground">{f.help}</p>}
            </div>
          ))}
        </CardContent>
      </Card>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Save />} {submitLabel}</Button>
        <Button type="button" variant="ghost" onClick={() => router.push(backHref)}>Batal</Button>
      </div>
    </form>
  );
}
