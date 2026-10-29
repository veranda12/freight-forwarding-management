import type { FieldConfig } from "@/components/crud/entity-form";
import { VENDOR_TYPE_LABELS } from "@/lib/enums";

export const VENDOR_FIELDS: FieldConfig[] = [
  { name: "name", label: "Nama Vendor", colSpan: 2, placeholder: "PT Trans Jaya Logistik", required: true },
  {
    name: "type", label: "Tipe", type: "select", required: true,
    options: Object.entries(VENDOR_TYPE_LABELS).map(([value, label]) => ({ value, label })),
  },
  { name: "scacCode", label: "Kode Carrier / IATA", placeholder: "MAEU / 126" },
  { name: "npwp", label: "NPWP" },
  { name: "address", label: "Alamat", colSpan: 2 },
  { name: "city", label: "Kota" },
  { name: "country", label: "Negara", placeholder: "Indonesia" },
  { name: "phone", label: "Telepon" },
  { name: "email", label: "Email", type: "email" },
  { name: "isForeign", label: "Vendor luar negeri (kena PPh 26)", type: "checkbox" },
  { name: "pph26Rate", label: "Tarif PPh 26 khusus (%), kosong = tarif charge code", type: "number", placeholder: "20" },
  { name: "skdNumber", label: "No. SKD / P3B (opsional)", colSpan: 2 },
];
