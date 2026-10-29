import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { TabTitle } from "@/components/shell/tabs-context";

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className="mb-2 flex items-center gap-1 text-sm text-muted-foreground" aria-label="Breadcrumb">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3.5 w-3.5 opacity-60" />}
          {it.href ? (
            <Link href={it.href} className="hover:text-foreground hover:underline">{it.label}</Link>
          ) : (
            <span className="font-medium text-foreground">{it.label}</span>
          )}
        </span>
      ))}
      {items.length > 0 && <TabTitle title={items[items.length - 1].label} />}
    </nav>
  );
}
