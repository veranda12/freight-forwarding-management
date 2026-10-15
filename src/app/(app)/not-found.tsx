import Link from "next/link";
import { FileQuestion, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";

export default function AppNotFound() {
  return (
    <div className="py-10">
      <EmptyState
        icon={FileQuestion}
        title="Data tidak ditemukan"
        description="Item yang Anda cari tidak ada, sudah dihapus, atau tautannya salah."
      >
        <Button asChild><Link href="/dashboard"><Home /> Ke Dashboard</Link></Button>
      </EmptyState>
    </div>
  );
}
