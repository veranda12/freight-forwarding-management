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
