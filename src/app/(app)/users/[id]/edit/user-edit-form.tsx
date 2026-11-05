"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { KeyRound, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateUserAction, resetPasswordAction } from "../../actions";

type RoleOpt = { value: string; label: string };
type EditUser = { id: string; name: string; phone: string; roleId: string; isActive: boolean };

export function UserEditForm({ user, roles, isSelf }: { user: EditUser; roles: RoleOpt[]; isSelf: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone);
  const [roleId, setRoleId] = useState(user.roleId);
  const [isActive, setIsActive] = useState(user.isActive);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  function save() {
    start(async () => {
      const res = await updateUserAction(user.id, { name, phone, roleId, isActive });
      if (res.ok) { toast.success("User diperbarui."); router.push("/users"); router.refresh(); }
      else toast.error(res.error);
    });
  }

  function reset() {
    start(async () => {
      const res = await resetPasswordAction(user.id, password, confirm);
      if (res.ok) { toast.success("Password direset."); setPassword(""); setConfirm(""); }
      else toast.error(res.error);
    });
  }

  return (
    <div className="grid max-w-3xl gap-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Data user & akses</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="u-name">Nama lengkap</Label>
            <Input id="u-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="u-phone">Telepon (opsional)</Label>
            <Input id="u-phone" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={roleId} onValueChange={setRoleId}>
              <SelectTrigger aria-label="Role"><SelectValue /></SelectTrigger>
              <SelectContent>
                {roles.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3 sm:col-span-2">
            <input id="u-active" type="checkbox" className="h-4 w-4 accent-primary" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} disabled={isSelf} />
            <Label htmlFor="u-active">{isActive ? "Aktif — bisa login" : "Nonaktif — tidak bisa login (langsung keluar)"}</Label>
            {isSelf && <span className="text-xs text-muted-foreground">Akun sendiri tidak bisa dinonaktifkan.</span>}
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <Button onClick={save} disabled={pending || name.trim().length < 2 || !roleId}>
              {pending ? <Loader2 className="animate-spin" /> : <Save />} Simpan perubahan
            </Button>
            <Button variant="ghost" onClick={() => router.push("/users")} disabled={pending}>Batal</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Reset password</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="u-pass">Password baru</Label>
            <Input id="u-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={72} autoComplete="new-password" />
            <p className="text-xs text-muted-foreground">Minimal 8 karakter.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="u-pass2">Ulangi password</Label>
            <Input id="u-pass2" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} maxLength={72} autoComplete="new-password" />
            {confirm.length > 0 && confirm !== password && <p className="text-xs text-destructive">Password belum sama.</p>}
          </div>
          <div className="sm:col-span-2">
            <Button variant="outline" onClick={reset} disabled={pending || password.length < 8 || confirm !== password}>
              <KeyRound /> Reset password
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
