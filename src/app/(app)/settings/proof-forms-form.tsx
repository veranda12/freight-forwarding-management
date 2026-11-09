"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PROOF_FORMS, type ProofFormValues } from "@/lib/proof-forms";
import { saveProofFormsAction } from "./actions";

/** Kotak dokumen SOP di kanan atas cetakan bukti: Doc. No, Revision, Effective Date per jenis formulir. */
export function ProofFormsForm({ initial, canWrite }: { initial: ProofFormValues[]; canWrite: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState(initial);
  const set = (code: string, p: Partial<ProofFormValues>) => setRows((rs) => rs.map((r) => (r.code === code ? { ...r, ...p } : r)));

  function save() {
    start(async () => {
      const res = await saveProofFormsAction(rows);
      if (res.ok) { toast.success("Formulir bukti disimpan."); setEditing(false); router.refresh(); } else toast.error(res.error);
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Formulir bukti (SOP)</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">Tampil di kotak kanan atas cetakan bukti kas/bank, jurnal, dan voucher. Kosongkan bila belum ditetapkan.</p>
        </div>
        {canWrite && !editing && <Button variant="outline" size="sm" onClick={() => setEditing(true)}><Pencil /> Ubah</Button>}
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Formulir</TableHead><TableHead>Doc. No</TableHead><TableHead>Revision</TableHead><TableHead>Effective Date</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {PROOF_FORMS.map((f) => {
              const r = rows.find((x) => x.code === f.code)!;
              return (
                <TableRow key={f.code}>
                  <TableCell className="whitespace-nowrap">{f.name} <span className="text-xs text-muted-foreground">({f.code})</span></TableCell>
                  {editing ? (
                    <>
                      <TableCell><Input aria-label={`Doc. No ${f.name}`} value={r.docNo} maxLength={40} onChange={(e) => set(f.code, { docNo: e.target.value })} placeholder="FRM/FIN/01" /></TableCell>
                      <TableCell><Input aria-label={`Revision ${f.name}`} value={r.revision} maxLength={20} onChange={(e) => set(f.code, { revision: e.target.value })} placeholder="01" className="w-24" /></TableCell>
                      <TableCell><Input aria-label={`Effective Date ${f.name}`} type="date" value={r.effectiveDate} onChange={(e) => set(f.code, { effectiveDate: e.target.value })} className="w-40" /></TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell>{r.docNo || "-"}</TableCell>
                      <TableCell>{r.revision || "-"}</TableCell>
                      <TableCell>{r.effectiveDate || "-"}</TableCell>
                    </>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {editing && (
          <div className="flex justify-end gap-2 border-t px-6 py-3">
            <Button variant="ghost" onClick={() => { setRows(initial); setEditing(false); }}>Batal</Button>
            <Button onClick={save} disabled={pending}>{pending && <Loader2 className="animate-spin" />} Simpan</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
