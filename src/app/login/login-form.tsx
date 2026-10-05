"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, Loader2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction, type LoginState } from "./actions";

const DEMO = [
  { role: "Admin", email: "admin@demo.com" },
  { role: "Sales", email: "sales@demo.com" },
  { role: "Operation", email: "ops@demo.com" },
  { role: "Documentation", email: "docs@demo.com" },
  { role: "Finance", email: "finance@demo.com" },
  { role: "Management", email: "manager@demo.com" },
];

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : <LogIn />}
      Masuk
    </Button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState<LoginState, FormData>(loginAction, undefined);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" placeholder="admin@demo.com" defaultValue="admin@demo.com" required autoComplete="username" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" placeholder="••••••••" defaultValue="demo123" required autoComplete="current-password" />
      </div>

      {state?.error && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {state.error}
        </div>
      )}

      <SubmitButton />

      <div className="rounded-lg border bg-muted/40 p-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Akun demo (password: <span className="font-semibold">demo123</span>)</p>
        <div className="grid grid-cols-2 gap-1.5 text-xs">
          {DEMO.map((d) => (
            <div key={d.email} className="flex flex-col">
              <span className="font-medium">{d.role}</span>
              <span className="text-muted-foreground">{d.email}</span>
            </div>
          ))}
        </div>
      </div>
    </form>
  );
}
