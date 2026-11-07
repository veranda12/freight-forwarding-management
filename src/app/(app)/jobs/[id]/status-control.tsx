"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, Loader2, LockOpen } from "lucide-react";
import type { JobStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { JOB_STATUS_FLOW, JOB_STATUS_LABELS } from "@/lib/enums";
import { reopenJob, updateJobStatus } from "../actions";

export function StatusControl({ jobId, current, isAdmin, locked }: { jobId: string; current: JobStatus; isAdmin: boolean; locked: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);

  function set(status: JobStatus) {
    start(async () => {
      try {
        await updateJobStatus(jobId, status);
        toast.success(`Status diperbarui ke ${JOB_STATUS_LABELS[status]}`);
        router.refresh();
      } catch {
        toast.error("Gagal memperbarui status.");
      }
    });
  }

  function reopen() {
    start(async () => {
      const res = await reopenJob(jobId, reason);
      if (res.ok) { toast.success("Job dibuka."); setOpen(false); setReason(""); router.refresh(); }
      else toast.error(res.error ?? "Gagal.");
    });
  }

  if (current === "CLOSED") {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button variant="outline"><LockOpen /> Buka Job</Button></DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Buka job ini?</DialogTitle>
            <DialogDescription>Status kembali ke Delivered, supaya Finance bisa menambah biaya susulan. Alasannya tercatat.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 text-sm"><Label>Alasan</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="contoh: tagihan vendor susulan" /></div>
          <DialogFooter>
            <DialogClose asChild><Button variant="ghost">Batal</Button></DialogClose>
            <Button onClick={reopen} disabled={pending || reason.trim().length < 3}>{pending ? <Loader2 className="animate-spin" /> : null} Buka Job</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          Ubah Status <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Pindahkan status ke</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {JOB_STATUS_FLOW.filter((s) => s !== "CLOSED" || (isAdmin && locked)).map((s) => (
          <DropdownMenuItem key={s} disabled={s === current} onSelect={() => set(s)}>
            {JOB_STATUS_LABELS[s]}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive" onSelect={() => set("CANCELLED")}>
          Batalkan Job
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
