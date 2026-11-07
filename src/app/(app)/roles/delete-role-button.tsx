"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { deleteRoleAction } from "./actions";

export function DeleteRoleButton({ id, name, users }: { id: string; name: string; users: number }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const remove = () =>
    start(async () => {
      const res = await deleteRoleAction(id);
      if (res.ok) { toast.success(`Role ${name} dihapus.`); setOpen(false); router.refresh(); }
      else toast.error(res.error);
    });
  return (
    <>
      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setOpen(true)} aria-label={`Hapus role ${name}`}><Trash2 /> Hapus</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Hapus role {name}?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            {users > 0 ? `Role ini masih dipakai ${users} user dan tidak bisa dihapus. Pindahkan user ke role lain dulu.` : "Role akan dihapus permanen."}
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Batal</Button>
            <Button variant="destructive" disabled={pending || users > 0} onClick={remove}>Ya, hapus</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
