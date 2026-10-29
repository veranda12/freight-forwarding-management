import type { FieldConfig } from "@/components/crud/entity-form";

export const TARIFF_FIELDS: FieldConfig[] = [
  {
    name: "mode", label: "Mode", type: "select", required: true,
    options: [{ value: "DARAT", label: "Darat" }, { value: "LAUT", label: "Laut" }, { value: "UDARA", label: "Udara" }],
  },
  { name: "ratePerKg", label: "Tarif per kg (Rp)", type: "number", step: "1", required: true, help: "Harga jual ke customer" },
  { name: "originCity", label: "Kota asal", placeholder: "Jakarta", required: true },
  { name: "destCity", label: "Kota tujuan", placeholder: "Makassar", required: true },
  { name: "minChargeKg", label: "Minimum berat tagih (kg)", type: "number", step: "0.5", help: "Dipakai jika lebih besar dari minimum di Aturan Berat" },
  { name: "leadTimeMin", label: "Lead time minimal (hari)", type: "number", step: "1", required: true },
  { name: "leadTimeMax", label: "Lead time maksimal (hari)", type: "number", step: "1", required: true },
  { name: "isActive", label: "Tarif aktif", type: "checkbox" },
  { name: "note", label: "Catatan", type: "textarea", colSpan: 2 },
];
