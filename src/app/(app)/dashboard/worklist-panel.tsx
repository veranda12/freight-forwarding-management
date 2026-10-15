import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { formatIDR, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export type WorkItem = {
  id: string; number: string; party: string; date: string | null; extra?: string; amount?: number;
};

export function WorklistPanel({
  title, items, hrefBase, icon: Icon, tone = "default", emptyText = "Tidak ada antrian",
}: {
  title: string;
  items: WorkItem[];
  hrefBase: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "default" | "warning" | "destructive";
  emptyText?: string;
}) {
  const toneCls = { default: "text-primary", warning: "text-warning", destructive: "text-destructive" }[tone];
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 py-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Icon className={cn("h-4 w-4", toneCls)} /> {title}
        </CardTitle>
        {items.length > 0 && <Badge variant={tone === "destructive" ? "destructive" : tone === "warning" ? "warning" : "secondary"}>{items.length}</Badge>}
      </CardHeader>
      <CardContent className="p-0">
        {items.length ? (
          <ul className="divide-y">
            {items.map((it) => (
              <li key={it.id}>
                <Link href={`${hrefBase}${it.id}`} className="flex items-center justify-between gap-3 px-4 py-2 text-sm hover:bg-accent">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{it.number}</span>
                    <span className="block truncate text-xs text-muted-foreground">{it.party}{it.extra ? ` · ${it.extra}` : ""}</span>
                  </span>
                  <span className="shrink-0 text-right text-xs">
                    {it.amount != null ? <span className="font-medium tabular-nums text-destructive">{formatIDR(it.amount)}</span> : <span className="text-muted-foreground">{formatDate(it.date)}</span>}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title={emptyText} className="border-0 py-6" />
        )}
      </CardContent>
    </Card>
  );
}
