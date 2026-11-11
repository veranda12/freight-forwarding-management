import { formatInTimeZone } from "date-fns-tz";
import { id as idLocale } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { TZ } from "@/lib/format";
import {
  EVENT_LABELS, REVIEW_LABELS, SEVERITY_LABELS, isEventType, isReviewStatus, isSeverity,
} from "@/lib/security/types";

/** Waktu disimpan UTC, ditampilkan Asia/Jakarta dengan label WIB. */
export const wib = (d: Date | string) => `${formatInTimeZone(new Date(d), TZ, "dd MMM yyyy, HH:mm:ss", { locale: idLocale })} WIB`;

const SEV_CLASS: Record<string, string> = {
  HIGH: "border-destructive/40 bg-destructive/10 text-destructive",
  MEDIUM: "border-warning/50 bg-warning/10 text-warning",
  LOW: "border-primary/30 text-primary",
  INFO: "text-muted-foreground",
};

export function SeverityBadge({ value }: { value: string }) {
  return <Badge variant="outline" className={SEV_CLASS[value] ?? ""}>{isSeverity(value) ? SEVERITY_LABELS[value] : value}</Badge>;
}

export function TypeLabel({ value }: { value: string }) {
  return <span className="whitespace-nowrap">{isEventType(value) ? EVENT_LABELS[value] : value}</span>;
}

const STATUS_CLASS: Record<string, string> = {
  NEW: "border-primary/40 text-primary",
  IN_REVIEW: "border-warning/50 text-warning",
  RESOLVED: "border-success/40 text-success",
};

export function StatusBadge({ value }: { value: string | null | undefined }) {
  const v = value ?? "NEW";
  return <Badge variant="outline" className={STATUS_CLASS[v] ?? ""}>{isReviewStatus(v) ? REVIEW_LABELS[v] : v}</Badge>;
}

/** Perkiraan lokasi dari IP. Tanpa data -> "Lokasi tidak tersedia" (tidak ada nilai karangan). */
export function locationText(e: { country?: string | null; region?: string | null; city?: string | null }) {
  const parts = [e.city, e.region, e.country].filter(Boolean);
  return parts.length ? parts.join(", ") : "Lokasi tidak tersedia";
}
