import { Card, CardContent } from "@/components/ui/card";

export type StatItem = { label: string; value: React.ReactNode; tone?: "default" | "success" | "warning" | "destructive" };

const TONE: Record<string, string> = {
  default: "",
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
};

/** Strip KPI operasional yang rapat — pengganti kartu stat raksasa (D-12/D-17). */
export function StatStrip({ items }: { items: StatItem[] }) {
  return (
    <Card>
      <CardContent className="grid grid-cols-2 divide-x divide-y p-0 sm:grid-cols-4 sm:divide-y-0">
        {items.map((it) => (
          <div key={it.label} className="px-4 py-3">
            <p className="truncate text-xs text-muted-foreground">{it.label}</p>
            <p className={`truncate text-base font-semibold tabular-nums ${TONE[it.tone ?? "default"]}`}>{it.value}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
