import { z } from "zod";

export const customerSchema = z.object({
  name: z.string().min(3, "Nama minimal 3 karakter"),
  npwp: z.string().optional().or(z.literal("")),
  industry: z.string().optional().or(z.literal("")),
  address: z.string().optional().or(z.literal("")),
  city: z.string().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  email: z.string().email("Email tidak valid").optional().or(z.literal("")),
  termOfPayment: z.coerce.number().int().min(0).max(180),
  creditLimit: z.coerce.number().min(0),
  salesPicId: z.string().optional().or(z.literal("")),
  contactName: z.string().optional().or(z.literal("")),
  contactPosition: z.string().optional().or(z.literal("")),
  contactPhone: z.string().optional().or(z.literal("")),
  contactEmail: z.string().email("Email kontak tidak valid").optional().or(z.literal("")),
});

export type CustomerInput = z.infer<typeof customerSchema>;

const opt = z.string().optional().or(z.literal(""));

export const vendorSchema = z.object({
  name: z.string().min(2, "Nama minimal 2 karakter"),
  type: z.enum(["SHIPPING_LINE", "AIRLINE", "TRUCKING", "CUSTOMS_BROKER", "WAREHOUSE", "DEPOT", "OTHER"]),
  scacCode: opt,
  npwp: opt,
  address: opt,
  city: opt,
  country: opt,
  phone: opt,
  email: z.string().email("Email tidak valid").optional().or(z.literal("")),
});
export type VendorInput = z.infer<typeof vendorSchema>;

export const agentSchema = z.object({
  name: z.string().min(2, "Nama minimal 2 karakter"),
  country: z.string().min(2, "Negara wajib diisi"),
  city: z.string().min(1, "Kota wajib diisi"),
  address: opt,
  email: z.string().email("Email tidak valid").optional().or(z.literal("")),
  phone: opt,
});
export type AgentInput = z.infer<typeof agentSchema>;

export const commoditySchema = z.object({
  hsCode: z.string().min(2, "HS Code wajib diisi"),
  name: z.string().min(2, "Nama komoditas wajib diisi"),
});
export type CommodityInput = z.infer<typeof commoditySchema>;

export const containerTypeSchema = z.object({
  code: z.string().min(2, "Kode wajib diisi"),
  name: z.string().min(2, "Nama wajib diisi"),
  teu: z.coerce.number().min(0).max(10),
});
export type ContainerTypeInput = z.infer<typeof containerTypeSchema>;

export const taxSchema = z.object({
  code: z.string().min(2, "Kode wajib diisi"),
  name: z.string().min(2, "Nama wajib diisi"),
  type: z.enum(["PPN", "PPH23"]),
  rate: z.coerce.number().min(0).max(100),
});
export type TaxInput = z.infer<typeof taxSchema>;

export const rateSchema = z.object({
  vendorId: z.string().min(1, "Vendor wajib dipilih"),
  mode: z.enum(["SEA_FCL", "SEA_LCL", "AIR", "LAND", "CUSTOMS"]),
  chargeCodeId: z.string().min(1, "Charge wajib dipilih"),
  originPortId: opt,
  destPortId: opt,
  containerTypeId: opt,
  currency: z.string().min(1),
  buyingPrice: z.coerce.number().min(0),
  validFrom: z.string().min(1, "Tanggal mulai wajib"),
  validUntil: z.string().min(1, "Tanggal akhir wajib"),
});
export type RateInput = z.infer<typeof rateSchema>;

// ---------------- Aturan Berat & Domestik ----------------

const num0 = z.coerce.number().min(0, "Tidak boleh negatif");

export const weightRuleSchema = z
  .object({
    id: z.string().min(1),
    divisor: z.coerce.number().int("Divisor harus bilangan bulat").min(100, "Divisor minimal 100").max(100000, "Divisor maksimal 100.000"),
    minChargeableKg: num0,
    minVolumeCbm: z.coerce.number().min(0, "Tidak boleh negatif").max(100, "Volume minimum maksimal 100 CBM").default(0),
    roundingKg: z.coerce.number().min(0).max(1000, "Pembulatan maksimal 1.000 kg"),
    roundingToleranceKg: num0.default(0),
    note: opt,
  })
  .refine((d) => d.roundingToleranceKg === 0 || d.roundingToleranceKg < d.roundingKg, {
    message: "Toleransi harus lebih kecil dari kelipatan pembulatan",
    path: ["roundingToleranceKg"],
  });
export type WeightRuleFormInput = z.infer<typeof weightRuleSchema>;

export const DOMESTIC_MODES = ["DARAT", "LAUT", "UDARA"] as const;

export const domesticTariffSchema = z
  .object({
    mode: z.enum(DOMESTIC_MODES),
    originCity: z.string().trim().min(2, "Kota asal wajib diisi"),
    destCity: z.string().trim().min(2, "Kota tujuan wajib diisi"),
    ratePerKg: z.coerce.number().positive("Tarif per kg harus lebih dari 0"),
    minChargeKg: num0,
    leadTimeMin: z.coerce.number().int().min(0),
    leadTimeMax: z.coerce.number().int().min(0),
    note: opt,
  })
  .refine((d) => d.leadTimeMax >= d.leadTimeMin, { message: "Lead time maksimal harus ≥ minimal", path: ["leadTimeMax"] })
  .refine((d) => d.originCity.toLowerCase() !== d.destCity.toLowerCase(), { message: "Kota asal dan tujuan tidak boleh sama", path: ["destCity"] });
export type DomesticTariffInput = z.infer<typeof domesticTariffSchema>;

export const domesticPackageSchema = z.object({
  qty: z.coerce.number().int().min(1, "Jumlah koli minimal 1"),
  lengthCm: z.coerce.number().positive("Panjang wajib diisi"),
  widthCm: z.coerce.number().positive("Lebar wajib diisi"),
  heightCm: z.coerce.number().positive("Tinggi wajib diisi"),
  weightKg: num0,
  description: opt,
});

export const domesticShipmentSchema = z.object({
  customerId: z.string().min(1, "Customer wajib dipilih"),
  mode: z.enum(DOMESTIC_MODES),
  originCity: z.string().trim().min(2, "Kota asal wajib diisi"),
  destCity: z.string().trim().min(2, "Kota tujuan wajib diisi"),
  shipperName: z.string().trim().min(2, "Nama pengirim wajib diisi"),
  shipperPhone: opt,
  shipperAddress: opt,
  consigneeName: z.string().trim().min(2, "Nama penerima wajib diisi"),
  consigneePhone: opt,
  consigneeAddress: opt,
  goodsDescription: opt,
  declaredValue: num0.default(0),
  insurancePct: z.coerce.number().min(0).max(10, "Asuransi maksimal 10%").default(0),
  packingAmount: num0.default(0),
  otherAmount: num0.default(0),
  customRatePerKg: num0.default(0), // 0 = pakai tarif standar
  vendorId: opt,
  costAmount: num0.default(0),
  pickupDate: opt,
  notes: opt,
  packages: z.array(domesticPackageSchema).min(1, "Minimal 1 baris koli"),
});
export type DomesticShipmentInput = z.infer<typeof domesticShipmentSchema>;
