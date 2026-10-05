import { Badge } from "@/components/ui/badge";
import {
  JOB_STATUS_LABELS, JOB_STATUS_VARIANT,
  QUO_STATUS_LABELS, QUO_STATUS_VARIANT,
  INV_STATUS_LABELS, INV_STATUS_VARIANT,
  BILL_STATUS_LABELS, BILL_STATUS_VARIANT,
  BOOKING_STATUS_LABELS, BOOKING_STATUS_VARIANT,
} from "@/lib/enums";
import type {
  JobStatus, QuotationStatus, InvoiceStatus, BillStatus, BookingStatus,
} from "@prisma/client";

export function JobStatusBadge({ status }: { status: JobStatus }) {
  return <Badge variant={JOB_STATUS_VARIANT[status]}>{JOB_STATUS_LABELS[status]}</Badge>;
}
export function QuoStatusBadge({ status }: { status: QuotationStatus }) {
  return <Badge variant={QUO_STATUS_VARIANT[status]}>{QUO_STATUS_LABELS[status]}</Badge>;
}
export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return <Badge variant={INV_STATUS_VARIANT[status]}>{INV_STATUS_LABELS[status]}</Badge>;
}
export function BillStatusBadge({ status }: { status: BillStatus }) {
  return <Badge variant={BILL_STATUS_VARIANT[status]}>{BILL_STATUS_LABELS[status]}</Badge>;
}
export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  return <Badge variant={BOOKING_STATUS_VARIANT[status]}>{BOOKING_STATUS_LABELS[status]}</Badge>;
}
