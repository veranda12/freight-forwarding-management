import type {
  TransportMode,
  TradeDirection,
  JobStatus,
  QuotationStatus,
  InvoiceStatus,
  BillStatus,
  BookingStatus,
  VendorType,
  NoteStatus,
  DomesticMode,
  DomesticStatus,
} from "@prisma/client";

type BadgeVariant = "default" | "secondary" | "outline" | "success" | "warning" | "destructive" | "muted";

export const MODE_LABELS: Record<TransportMode, string> = {
  SEA_FCL: "Sea FCL",
  SEA_LCL: "Sea LCL",
  AIR: "Air Freight",
  LAND: "Land / Trucking",
  CUSTOMS: "Customs Clearance",
};

export const MODE_SHORT: Record<TransportMode, string> = {
  SEA_FCL: "FCL",
  SEA_LCL: "LCL",
  AIR: "AIR",
  LAND: "LAND",
  CUSTOMS: "CC",
};

export const DIRECTION_LABELS: Record<TradeDirection, string> = {
  EXPORT: "Export",
  IMPORT: "Import",
};

/** untuk key sequence job: SEA-EXP, AIR-IMP, dst */
export function modeDirKey(mode: TransportMode, dir: TradeDirection): string {
  const m =
    mode === "SEA_FCL" || mode === "SEA_LCL"
      ? "SEA"
      : mode === "AIR"
      ? "AIR"
      : mode === "LAND"
      ? "LAND"
      : "CC";
  const d = dir === "EXPORT" ? "EXP" : "IMP";
  return `${m}-${d}`;
}

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  DRAFT: "Draft",
  BOOKED: "Booked",
  STUFFING: "Stuffing / Pickup",
  DEPARTED: "Departed",
  IN_TRANSIT: "In Transit",
  ARRIVED: "Arrived",
  CUSTOMS_CLEARANCE: "Customs Clearance",
  DELIVERED: "Delivered",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
};

export const JOB_STATUS_VARIANT: Record<JobStatus, BadgeVariant> = {
  DRAFT: "muted",
  BOOKED: "secondary",
  STUFFING: "secondary",
  DEPARTED: "default",
  IN_TRANSIT: "default",
  ARRIVED: "warning",
  CUSTOMS_CLEARANCE: "warning",
  DELIVERED: "success",
  CLOSED: "success",
  CANCELLED: "destructive",
};

/** urutan workflow status job (tanpa CANCELLED) */
export const JOB_STATUS_FLOW: JobStatus[] = [
  "DRAFT",
  "BOOKED",
  "STUFFING",
  "DEPARTED",
  "IN_TRANSIT",
  "ARRIVED",
  "CUSTOMS_CLEARANCE",
  "DELIVERED",
  "CLOSED",
];

export const QUO_STATUS_LABELS: Record<QuotationStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
};

export const QUO_STATUS_VARIANT: Record<QuotationStatus, BadgeVariant> = {
  DRAFT: "muted",
  SENT: "default",
  ACCEPTED: "success",
  REJECTED: "destructive",
  EXPIRED: "warning",
};

export const INV_STATUS_LABELS: Record<InvoiceStatus, string> = {
  UNPAID: "Unpaid",
  PARTIAL: "Partial",
  PAID: "Paid",
  OVERDUE: "Overdue",
  CANCELLED: "Cancelled",
};

export const INV_STATUS_VARIANT: Record<InvoiceStatus, BadgeVariant> = {
  UNPAID: "secondary",
  PARTIAL: "warning",
  PAID: "success",
  OVERDUE: "destructive",
  CANCELLED: "muted",
};

export const BILL_STATUS_LABELS: Record<BillStatus, string> = {
  UNPAID: "Unpaid",
  PARTIAL: "Partial",
  PAID: "Paid",
  CANCELLED: "Cancelled",
};

export const BILL_STATUS_VARIANT: Record<BillStatus, BadgeVariant> = {
  UNPAID: "secondary",
  PARTIAL: "warning",
  PAID: "success",
  CANCELLED: "muted",
};

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  REQUESTED: "Requested",
  CONFIRMED: "Confirmed",
  CANCELLED: "Cancelled",
};

export const BOOKING_STATUS_VARIANT: Record<BookingStatus, BadgeVariant> = {
  REQUESTED: "warning",
  CONFIRMED: "success",
  CANCELLED: "muted",
};

export const NOTE_STATUS_LABELS: Record<NoteStatus, string> = {
  DRAFT: "Draft",
  ISSUED: "Issued",
  SETTLED: "Settled",
  CANCELLED: "Cancelled",
};

export const VENDOR_TYPE_LABELS: Record<VendorType, string> = {
  SHIPPING_LINE: "Shipping Line",
  AIRLINE: "Airline",
  TRUCKING: "Trucking",
  CUSTOMS_BROKER: "Customs Broker (PPJK)",
  WAREHOUSE: "Warehouse",
  DEPOT: "Depo",
  OTHER: "Lainnya",
};

// ---------------- Domestik ----------------

export const DOM_MODE_LABELS: Record<DomesticMode, string> = {
  DARAT: "Darat",
  LAUT: "Laut",
  UDARA: "Udara",
};

export const DOM_STATUS_LABELS: Record<DomesticStatus, string> = {
  BOOKED: "Order diterima",
  PICKED_UP: "Barang dijemput",
  IN_TRANSIT: "Dalam perjalanan",
  ARRIVED: "Tiba di kota tujuan",
  OUT_FOR_DELIVERY: "Diantar ke penerima",
  DELIVERED: "Diterima",
  CANCELLED: "Dibatalkan",
};

export const DOM_STATUS_VARIANT: Record<DomesticStatus, BadgeVariant> = {
  BOOKED: "secondary",
  PICKED_UP: "default",
  IN_TRANSIT: "default",
  ARRIVED: "warning",
  OUT_FOR_DELIVERY: "warning",
  DELIVERED: "success",
  CANCELLED: "destructive",
};

/** urutan status STT domestik (tanpa CANCELLED) */
export const DOM_STATUS_FLOW: DomesticStatus[] = [
  "BOOKED", "PICKED_UP", "IN_TRANSIT", "ARRIVED", "OUT_FOR_DELIVERY", "DELIVERED",
];

/** Label mode untuk aturan berat (gabungan Ekspor-Impor & Domestik). */
export const WEIGHT_RULE_MODE_LABELS: Record<string, string> = {
  AIR: "Air Freight",
  SEA_LCL: "Sea LCL",
  LAND: "Land / Trucking",
  UDARA: "Udara",
  DARAT: "Darat",
  LAUT: "Laut",
};
