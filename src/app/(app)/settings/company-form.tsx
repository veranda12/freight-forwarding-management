"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ImageUp, Loader2, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { removeCompanyLogoAction, saveCompanySettingAction, uploadCompanyLogoAction, type CompanyInput } from "./actions";

type Field = { key: keyof CompanyInput; label: string; placeholder?: string; required?: boolean };

const IDENTITY: Field[] = [
  { key: "name", label: "Nama", required: true, placeholder: "PT ..." },
  { key: "legalName", label: "Nama legal", placeholder: "Bila berbeda dari nama" },
  { key: "npwp", label: "NPWP" },
  { key: "address", label: "Alamat" },
  { key: "city", label: "Kota" },
  { key: "phone", label: "Telepon" },
  { key: "email", label: "Email" },
  { key: "website", label: "Website" },
];
const BANK: Field[] = [
  { key: "bankName", label: "Bank" },
  { key: "bankAccount", label: "No. Rekening" },
  { key: "bankHolder", label: "Atas Nama" },
  { key: "bankBranch", label: "Cabang" },
  { key: "signatoryName", label: "Penandatangan invoice" },
  { key: "signatoryTitle", label: "Jabatan" },
  { key: "docCode", label: "Kode nomor bukti" },
];

/** Identitas, rekening, penandatangan, dan logo perusahaan untuk dokumen & invoice. */
export function CompanyForm({ initial, hasLogo, canWrite }: { initial: CompanyInput; hasLogo: boolean; canWrite: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(initial);
  const [logoKey, setLogoKey] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  function save() {
    start(async () => {
      const res = await saveCompanySettingAction(form);
      if (res.ok) { toast.success("Setting perusahaan disimpan."); setEditing(false); router.refresh(); } else toast.error(res.error);
    });
  }

  function upload(file: File | undefined) {
    if (!file) return;
    const fd = new FormData();
    fd.set("logo", file);
    start(async () => {
      const res = await uploadCompanyLogoAction(fd);
      if (fileRef.current) fileRef.current.value = "";
      if (res.ok) { toast.success("Logo diperbarui."); setLogoKey((k) => k + 1); router.refresh(); } else toast.error(res.error);
    });
  }

  function removeLogo() {
    start(async () => {
      const res = await removeCompanyLogoAction();
      if (res.ok) { toast.success("Logo dihapus."); router.refresh(); } else toast.error(res.error);
    });
  }

  const section = (title: string, fields: Field[]) => (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-sm">
        {fields.map((f) => editing ? (
          <div key={f.key} className="grid items-center gap-1.5 sm:grid-cols-[10rem_1fr]">
            <Label htmlFor={`co-${f.key}`} className="text-muted-foreground">{f.label}{f.required ? " *" : ""}</Label>
            <Input id={`co-${f.key}`} value={form[f.key]} placeholder={f.placeholder} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
          </div>
        ) : (
          <div key={f.key} className="flex justify-between gap-4">
            <span className="text-muted-foreground">{f.label}</span><span className="text-right font-medium">{initial[f.key] || "-"}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="flex justify-end gap-2">
          {editing ? (
            <>
              <Button variant="ghost" disabled={pending} onClick={() => { setForm(initial); setEditing(false); }}>Batal</Button>
              <Button onClick={save} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : null} Simpan</Button>
            </>
          ) : <Button variant="outline" onClick={() => { setForm(initial); setEditing(true); }}><Pencil /> Edit</Button>}
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {section("Identitas", IDENTITY)}
        {section("Rekening Bank & Penandatangan", BANK)}
        <Card>
          <CardHeader><CardTitle className="text-base">Logo</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex h-24 items-center justify-center rounded-md border bg-muted/40">
              {hasLogo
                // eslint-disable-next-line @next/next/no-img-element
                ? <img key={logoKey} src={`/api/company-logo?v=${logoKey}`} alt="Logo perusahaan" className="max-h-20 max-w-full object-contain" />
                : <span className="text-xs text-muted-foreground">Belum ada logo</span>}
            </div>
            <p className="text-xs text-muted-foreground">Tampil di kop invoice PDF. PNG atau JPG, maksimal 800 KB.</p>
            {canWrite && (
              <div className="flex gap-2">
                <input ref={fileRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
                <Button size="sm" variant="outline" disabled={pending} onClick={() => fileRef.current?.click()}><ImageUp /> {hasLogo ? "Ganti logo" : "Unggah logo"}</Button>
                {hasLogo && <Button size="sm" variant="ghost" disabled={pending} onClick={removeLogo}><Trash2 /> Hapus</Button>}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
