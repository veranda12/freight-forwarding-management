import Link from "next/link";
import { ArrowLeft, FileSignature, ArrowRightLeft } from "lucide-react";
import { requireCan } from "@/lib/auth-helpers";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default async function NewJobPage() {
  await requireCan("jobs", "write", { redirectTo: "/jobs" });
  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2"><Link href="/jobs"><ArrowLeft /> Kembali</Link></Button>
        <PageHeader title="Job Baru" description="Buat job dari quotation yang sudah disetujui" />
      </div>
      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
            <ArrowRightLeft className="mt-0.5 h-5 w-5 text-primary" />
            <div>
              <p className="font-medium">Alur rekomendasi: Quotation → Job</p>
              <p className="text-sm text-muted-foreground">
                Buka quotation berstatus <span className="font-medium">Accepted/Sent</span>, lalu klik <span className="font-medium">Convert ke Job</span>.
                Seluruh charge (selling &amp; buying) otomatis terbawa ke costing job baru.
              </p>
            </div>
          </div>
          <Button asChild><Link href="/quotations"><FileSignature /> Ke daftar Quotation</Link></Button>
        </CardContent>
      </Card>
    </div>
  );
}
