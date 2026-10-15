import type { FieldConfig } from "@/components/crud/entity-form";

export const AGENT_FIELDS: FieldConfig[] = [
  { name: "name", label: "Nama Agent", colSpan: 2, placeholder: "Lion City Forwarding Pte Ltd", required: true },
  { name: "city", label: "Kota", required: true },
  { name: "country", label: "Negara", placeholder: "Singapore", required: true },
  { name: "address", label: "Alamat", colSpan: 2 },
  { name: "email", label: "Email", type: "email" },
  { name: "phone", label: "Telepon" },
];
