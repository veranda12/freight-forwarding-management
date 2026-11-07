"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createUserAction } from "../actions";

type RoleOpt = { value: string; label: string };

export function UserForm({ roles }: { roles: RoleOpt[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState(roles.find((r) => r.label === "Operation")?.value ?? roles[0]?.value ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const mismatch = confirm.length > 0 && confirm !== password;
  const canSave = name.trim().length >= 2 && email.trim().length > 0 && password.length >= 8 && confirm === password && !!role;

  function save() {
    start(async () => {
      const res = await createUserAction({ name, email, phone, roleId: role, password, confirmPassword: confirm });
      if (res.ok) {
        toast.success(`User ${email.trim().toLowerCase()} dibuat.`);
        router.push("/users");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader><CardTitle className="text-base">Data user</CardTitle></CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Nama lengkap</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Rina Sari" maxLength={80} />
        </div>
        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="rina@perusahaan.co.id" maxLength={120} autoComplete="off" />
        </div>
        <div className="space-y-1.5">
          <Label>Telepon (opsional)</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+62 812 3456 7890" maxLength={20} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Role</Label>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger aria-label="Role"><SelectValue /></SelectTrigger>
            <SelectContent>
              {roles.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Password</Label>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={72} autoComplete="new-password" />
          <p className="text-xs text-muted-foreground">Minimal 8 karakter.</p>
        </div>
        <div className="space-y-1.5">
          <Label>Ulangi password</Label>
          <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} maxLength={72} autoComplete="new-password" />
          {mismatch && <p className="text-xs text-destructive">Password belum sama.</p>}
        </div>
        <div className="flex gap-2 sm:col-span-2">
          <Button onClick={save} disabled={pending || !canSave}>
            {pending ? <Loader2 className="animate-spin" /> : <Save />} Simpan user
          </Button>
          <Button variant="ghost" onClick={() => router.push("/users")} disabled={pending}>Batal</Button>
        </div>
      </CardContent>
    </Card>
  );
}
