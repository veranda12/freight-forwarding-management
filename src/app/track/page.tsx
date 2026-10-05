import { redirect } from "next/navigation";
import { Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

async function trackSearch(formData: FormData) {
  "use server";
  const q = String(formData.get("q") ?? "").trim();
  if (q) redirect(`/track/${encodeURIComponent(q)}`);
}

export default function TrackLandingPage() {
  return (
    <div className="mx-auto max-w-xl space-y-6 py-10">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold">Lacak Shipment Anda</h1>
        <p className="text-sm text-muted-foreground">Masukkan nomor Job atau nomor B/L untuk melihat status terkini.</p>
      </div>
      <Card>
        <CardContent className="p-5">
          <form action={trackSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input name="q" placeholder="Contoh: SLLABC123456 atau JOB/SEA-EXP/2026/10/0001" className="pl-9" required />
            </div>
            <Button type="submit">Lacak</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
