"use client";

import { useEffect } from "react";
import { errorPayload, reportClientError } from "@/lib/client-log";

/** Error di root layout. Halaman ini menggantikan seluruh dokumen, jadi memakai gaya inline. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (!error.digest) reportClientError(errorPayload(error, "global-error"));
  }, [error]);

  return (
    <html lang="id">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, background: "#fff", color: "#111827" }}>
        <div style={{ maxWidth: 420, textAlign: "center", padding: 24 }}>
          <h2 style={{ fontSize: 18 }}>Terjadi kesalahan pada aplikasi</h2>
          <p style={{ fontSize: 14, color: "#6b7280" }}>Kesalahan sudah tercatat di log sistem. Silakan coba lagi.</p>
          {error.digest && <code style={{ fontSize: 12, background: "#f3f4f6", padding: "2px 6px", borderRadius: 4 }}>Kode: {error.digest}</code>}
          <div style={{ marginTop: 16 }}>
            <button onClick={reset} style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #d1d5db", background: "#111827", color: "#fff", cursor: "pointer" }}>Coba lagi</button>
          </div>
        </div>
      </body>
    </html>
  );
}
