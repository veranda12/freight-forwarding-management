"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { customerSchema, type CustomerInput } from "@/lib/validators";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { createCustomer, updateCustomer } from "./actions";

type SalesOption = { id: string; name: string };

export function CustomerForm({
  id,
  defaults,
  salesOptions,
}: {
  id?: string;
  defaults?: Partial<CustomerInput>;
  salesOptions: SalesOption[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const {
    register, handleSubmit, setValue, watch, formState: { errors },
  } = useForm<CustomerInput>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      termOfPayment: 30, creditLimit: 0, salesPicId: "",
      ...defaults,
    } as CustomerInput,
  });

  function onSubmit(data: CustomerInput) {
    start(async () => {
      const res = id ? await updateCustomer(id, data) : await createCustomer(data);
      if (res.ok) {
        toast.success(id ? "Customer diperbarui." : "Customer dibuat.");
        router.push(id ? `/customers/${id}` : `/customers/${(res as any).id}`);
        router.refresh();
      } else {
        toast.error(res.error ?? "Gagal menyimpan.");
      }
    });
  }

  const salesPic = watch("salesPicId");

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Data Customer</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Nama Perusahaan" error={errors.name?.message} className="sm:col-span-2">
            <Input {...register("name")} placeholder="PT Contoh Logistik Nusantara" />
          </Field>
          <Field label="NPWP"><Input {...register("npwp")} placeholder="99.999.999.9-999.999" /></Field>
          <Field label="Industri"><Input {...register("industry")} placeholder="Tekstil / Elektronik / …" /></Field>
          <Field label="Alamat" className="sm:col-span-2"><Input {...register("address")} /></Field>
          <Field label="Kota"><Input {...register("city")} /></Field>
          <Field label="Telepon"><Input {...register("phone")} /></Field>
          <Field label="Email" error={errors.email?.message}><Input {...register("email")} type="email" /></Field>
          <Field label="Term of Payment (hari)" error={errors.termOfPayment?.message}><Input {...register("termOfPayment")} type="number" /></Field>
          <Field label="Credit Limit (IDR)" error={errors.creditLimit?.message}><Input {...register("creditLimit")} type="number" step="1000000" /></Field>
          <Field label="Sales PIC">
            <Select value={salesPic || ""} onValueChange={(v) => setValue("salesPicId", v)}>
              <SelectTrigger><SelectValue placeholder="Pilih sales…" /></SelectTrigger>
              <SelectContent>
                {salesOptions.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </CardContent>
      </Card>

      {!id && (
        <Card>
          <CardHeader><CardTitle className="text-base">Kontak Utama (opsional)</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Nama Kontak"><Input {...register("contactName")} /></Field>
            <Field label="Jabatan"><Input {...register("contactPosition")} /></Field>
            <Field label="Telepon"><Input {...register("contactPhone")} /></Field>
            <Field label="Email" error={errors.contactEmail?.message}><Input {...register("contactEmail")} type="email" /></Field>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Save />} Simpan</Button>
        <Button type="button" variant="ghost" onClick={() => router.back()}>Batal</Button>
      </div>
    </form>
  );
}

function Field({ label, error, className, children }: { label: string; error?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
