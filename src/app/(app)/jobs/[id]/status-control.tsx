"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, Loader2 } from "lucide-react";
import type { JobStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { JOB_STATUS_FLOW, JOB_STATUS_LABELS } from "@/lib/enums";
import { updateJobStatus } from "../actions";

export function StatusControl({ jobId, current }: { jobId: string; current: JobStatus }) {
  const [pending, start] = useTransition();
  const router = useRouter();

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
        {JOB_STATUS_FLOW.map((s) => (
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
