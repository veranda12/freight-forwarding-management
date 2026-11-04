"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { errorPayload, reportClientError } from "@/lib/client-log";

/** Error saat merender halaman di dalam aplikasi. Error dicatat ke log, lalu user bisa mencoba lagi. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Error dari server sudah dicatat di server; yang dikirim di sini hanya error yang terjadi di browser.
    if (!error.digest) reportClientError(errorPayload(error, "error-boundary"));
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-20 text-center">
      <AlertTriangle className="h-10 w-10 text-destructive" />
      <h2 className="text-lg font-semibold">Terjadi kesalahan saat memuat halaman ini</h2>
      <p className="text-sm text-muted-foreground">Kesalahan sudah tercatat di log sistem. Coba muat ulang. Jika terus terjadi, laporkan kode di bawah ke admin.</p>
      {error.digest && <code className="rounded bg-muted px-2 py-1 text-xs">Kode: {error.digest}</code>}
      <Button onClick={reset}><RotateCcw /> Coba lagi</Button>
    </div>
  );
}
