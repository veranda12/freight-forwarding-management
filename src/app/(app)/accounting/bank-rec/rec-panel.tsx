"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setReconciledAction, saveBankReconAction } from "../actions";

export function ReconCheckbox({ id, checked }: { id: string; checked: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <input
      type="checkbox"
      className="h-4 w-4 cursor-pointer accent-primary"
      checked={checked}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.checked;
        start(async () => {
          const res = await setReconciledAction([id], next);
          if (!res.ok) toast.error(res.error);
          router.refresh();
        });
      }}
      aria-label="Sudah cocok dengan rekening koran"
    />
  );
}

export function ReconBulk({ ids, allChecked }: { ids: string[]; allChecked: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  function run(v: boolean) {
    start(async () => {
      const res = await setReconciledAction(ids, v);
      if (res.ok) { toast.success(v ? "Semua mutasi ditandai cocok." : "Tanda cocok dihapus."); router.refresh(); }
      else toast.error(res.error);
    });
  }
  return (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" onClick={() => run(true)} disabled={pending || ids.length === 0 || allChecked}>
        {pending ? <Loader2 className="animate-spin" /> : null} Tandai semua cocok
      </Button>
      <Button size="sm" variant="ghost" onClick={() => run(false)} disabled={pending || ids.length === 0}>Hapus semua tanda</Button>
    </div>
  );
}

export function SaveRecon({ accountCode, asOf, statementBalance, difference }: {
  accountCode: string; asOf: string; statementBalance: number | null; difference: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  function save() {
    if (statementBalance === null) { toast.error("Isi saldo rekening koran dulu."); return; }
    start(async () => {
      const res = await saveBankReconAction(accountCode, asOf, statementBalance);
      if (res.ok) { toast.success("Rekonsiliasi disimpan."); router.refresh(); }
      else toast.error(res.error);
    });
  }
  return (
    <Button onClick={save} disabled={pending || statementBalance === null} variant={Math.abs(difference) < 0.5 ? "default" : "outline"}>
      {pending ? <Loader2 className="animate-spin" /> : <Save />} Simpan rekonsiliasi{Math.abs(difference) < 0.5 ? "" : " (ada selisih)"}
    </Button>
  );
}

export function StatementInput({ defaultValue }: { defaultValue: number | null }) {
  const [v, setV] = useState(defaultValue === null ? "" : String(defaultValue));
  return (
    <input
      name="statement"
      type="number"
      value={v}
      onChange={(e) => setV(e.target.value)}
      placeholder="Saldo rekening koran"
      className="h-9 w-[12rem] rounded-md border bg-background px-2 text-sm"
    />
  );
}
