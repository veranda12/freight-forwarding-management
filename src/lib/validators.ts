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
