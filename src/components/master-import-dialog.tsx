"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, FileSpreadsheet, Loader2, Search, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { ImportKind, ImportSummary, RowResult } from "@/lib/master-import";

type Result = { committed: boolean; summary: ImportSummary; rows: RowResult[] };

const ACTION: Record<RowResult["action"], { label: string; className: string }> = {
  create: { label: "Baru", className: "border-success/50 text-success" },
  update: { label: "Perbarui", className: "border-primary/50 text-primary" },
  unchanged: { label: "Tidak berubah", className: "text-muted-foreground" },
  skip: { label: "Dilewati", className: "border-destructive/50 text-destructive" },
};

/** CSV baris yang dilewati (pemisah ; dan BOM supaya rapi dibuka di Excel berbahasa Indonesia). */
function downloadSkipped(rows: RowResult[], kind: ImportKind) {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const lines = [["Baris", "Kunci", "Nama", "Alasan"].map(q).join(";")];
  for (const r of rows.filter((x) => x.action === "skip")) lines.push([String(r.row), r.key, r.label, r.errors.join(" | ")].map(q).join(";"));
  const blob = new Blob([String.fromCharCode(0xfeff) + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `baris-dilewati-${kind}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * Import Excel untuk daftar master: unduh template → pilih file → Periksa (pratinjau, tidak menyimpan) → Simpan.
 * Simpan mengirim ulang file; server membaca dan memvalidasi ulang, hasil pratinjau di browser tidak dipercaya.
 */
export function MasterImportDialog({ kind, label }: { kind: ImportKind; label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<"preview" | "commit" | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() { setFile(null); setResult(null); setError(null); }

  async function send(mode: "preview" | "commit") {
    if (!file) return;
    setBusy(mode);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("mode", mode);
      const res = await fetch(`/api/master-import/${kind}`, { method: "POST", body: fd });
      const json = await res.json().catch(() => ({ ok: false, error: `Gagal (${res.status}).` }));
      if (!json.ok) { setError(json.error ?? "Gagal."); setResult(null); return; }
      setResult({ committed: json.committed, summary: json.summary, rows: json.rows });
      if (json.committed) {
        const s = json.summary as ImportSummary;
        toast.success(`Import selesai: ${s.create} baru, ${s.update} diperbarui${s.skip ? `, ${s.skip} dilewati` : ""}.`);
        router.refresh();
      }
    } catch {
      setError("Koneksi terputus. Coba lagi.");
    } finally {
      setBusy(null);
    }
  }

  const s = result?.summary;
  const toSave = s ? s.create + s.update : 0;
  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild><Button variant="outline"><FileSpreadsheet /> Import Excel</Button></DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import {label} dari Excel</DialogTitle>
          <DialogDescription>
            Kolom Kode kosong = data baru; Kode terisi = memperbarui data itu (sel kosong tidak mengubah apa pun). Baris yang salah fatal
            dilewati, peringatan tetap disimpan.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">1.</span>
            <Button asChild variant="outline" size="sm">
              <a href={`/api/master-import/${kind}/template`} download><Download /> Unduh template</a>
            </Button>
            <span className="text-xs text-muted-foreground">Isi sheet Data. Petunjuk kolom dan contoh ada di sheet lain.</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">2.</span>
            <Input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label="File Excel" className="max-w-sm"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); setError(null); }} />
            <Button size="sm" variant="secondary" disabled={!file || !!busy} onClick={() => send("preview")}>
              {busy === "preview" ? <Loader2 className="animate-spin" /> : <Search />} Periksa
            </Button>
          </div>
          {error && <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-destructive">{error}</p>}

          {s && result && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2" aria-label="Ringkasan import">
                <Badge variant="outline">{s.total} baris</Badge>
                <Badge variant="outline" className={ACTION.create.className}>{s.create} baru</Badge>
                <Badge variant="outline" className={ACTION.update.className}>{s.update} diperbarui</Badge>
                {s.unchanged > 0 && <Badge variant="outline">{s.unchanged} tidak berubah</Badge>}
                <Badge variant="outline" className={ACTION.skip.className}>{s.skip} dilewati</Badge>
                {s.warnings > 0 && <Badge variant="outline" className="border-warning/50 text-warning">{s.warnings} dengan peringatan</Badge>}
                {result.committed && <Badge>Tersimpan</Badge>}
              </div>
              <div className="max-h-[45vh] overflow-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted">
                    <tr><th className="px-2 py-1.5 text-left">Baris</th><th className="px-2 py-1.5 text-left">Kunci</th><th className="px-2 py-1.5 text-left">Nama</th><th className="px-2 py-1.5 text-left">Aksi</th><th className="px-2 py-1.5 text-left">Catatan</th></tr>
                  </thead>
                  <tbody>
                    {result.rows.map((r) => (
                      <tr key={r.row} className="border-t align-top">
                        <td className="px-2 py-1.5 tabular-nums">{r.row}</td>
                        <td className="px-2 py-1.5 font-mono">{r.key || (r.action === "create" ? "(baru)" : "-")}</td>
                        <td className="px-2 py-1.5">{r.label || "-"}</td>
                        <td className="px-2 py-1.5"><Badge variant="outline" className={ACTION[r.action].className}>{ACTION[r.action].label}</Badge></td>
                        <td className="px-2 py-1.5">
                          {r.errors.map((m) => <div key={m} className="text-destructive">{m}</div>)}
                          {r.warnings.map((m) => <div key={m} className="text-warning">{m}</div>)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {s.skip > 0 && (
                  <Button size="sm" variant="ghost" onClick={() => downloadSkipped(result.rows, kind)}><Download /> Unduh baris yang dilewati (CSV)</Button>
                )}
                {!result.committed ? (
                  <Button size="sm" disabled={toSave === 0 || !!busy} onClick={() => send("commit")}>
                    {busy === "commit" ? <Loader2 className="animate-spin" /> : <Upload />} Simpan {toSave} baris
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => { setOpen(false); reset(); }}>Tutup</Button>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
