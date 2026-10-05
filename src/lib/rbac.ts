import type { Role } from "@prisma/client";

export type Resource =
  | "dashboard"
  | "customers"
  | "vendors"
  | "agents"
  | "ports"
  | "currencies"
  | "charges"
  | "containers"
  | "commodities"
  | "taxes"
  | "coa"
  | "rates"
  | "quotations"
  | "jobs"
  | "bookings"
  | "tracking"
  | "documents"
  | "costing"
  | "invoices"
  | "bills"
  | "notes"
  | "payments"
  | "accounting"
  | "reports"
  | "users"
  | "settings"
  | "audit";

export type Action = "read" | "write";

const ALL: Role[] = ["ADMIN", "SALES", "OPERATION", "DOCUMENTATION", "FINANCE", "MANAGEMENT"];

/**
 * Matriks hak akses. ADMIN selalu penuh; MANAGEMENT selalu read-only semua.
 * `write` menyiratkan `read`.
 */
const MATRIX: Record<Resource, { read: Role[]; write: Role[] }> = {
  dashboard: { read: ALL, write: [] },
  tracking: { read: ALL, write: ["OPERATION", "DOCUMENTATION"] },

  customers: { read: ["SALES", "OPERATION", "FINANCE"], write: ["SALES"] },
  vendors: { read: ["SALES", "OPERATION", "FINANCE"], write: ["OPERATION", "FINANCE"] },
  agents: { read: ["SALES", "OPERATION", "FINANCE"], write: ["OPERATION", "FINANCE"] },
  ports: { read: ALL, write: ["OPERATION"] },
  currencies: { read: ALL, write: ["FINANCE"] },
  charges: { read: ["SALES", "OPERATION", "FINANCE"], write: ["FINANCE"] },
  containers: { read: ALL, write: ["OPERATION"] },
  commodities: { read: ALL, write: ["OPERATION", "SALES"] },
  taxes: { read: ["FINANCE", "SALES"], write: ["FINANCE"] },
  coa: { read: ["FINANCE"], write: ["FINANCE"] },

  rates: { read: ["SALES", "OPERATION"], write: ["SALES"] },
  quotations: { read: ["SALES", "OPERATION"], write: ["SALES"] },

  jobs: { read: ["SALES", "OPERATION", "DOCUMENTATION", "FINANCE"], write: ["OPERATION"] },
  bookings: { read: ["OPERATION", "DOCUMENTATION"], write: ["OPERATION"] },
  documents: { read: ["OPERATION", "DOCUMENTATION", "FINANCE"], write: ["DOCUMENTATION", "OPERATION"] },

  costing: { read: ["SALES", "OPERATION", "FINANCE"], write: ["OPERATION", "FINANCE"] },
  invoices: { read: ["FINANCE", "SALES"], write: ["FINANCE"] },
  bills: { read: ["FINANCE"], write: ["FINANCE"] },
  notes: { read: ["FINANCE"], write: ["FINANCE"] },
  payments: { read: ["FINANCE"], write: ["FINANCE"] },
  accounting: { read: ["FINANCE"], write: ["FINANCE"] },

  reports: { read: ["SALES", "OPERATION", "FINANCE"], write: [] },
  users: { read: [], write: [] },
  settings: { read: ["FINANCE"], write: [] },
  audit: { read: [], write: [] },
};

export function can(role: Role | undefined | null, resource: Resource, action: Action = "read"): boolean {
  if (!role) return false;
  if (role === "ADMIN") return true;
  const entry = MATRIX[resource];
  if (!entry) return false;
  if (action === "read") {
    if (role === "MANAGEMENT") return true; // read-only everything
    return entry.read.includes(role) || entry.write.includes(role);
  }
  // write
  if (role === "MANAGEMENT") return false;
  return entry.write.includes(role);
}

export function resourcesForRole(role: Role): Resource[] {
  return (Object.keys(MATRIX) as Resource[]).filter((r) => can(role, r, "read"));
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Admin",
  SALES: "Sales",
  OPERATION: "Operation",
  DOCUMENTATION: "Documentation",
  FINANCE: "Finance",
  MANAGEMENT: "Management",
};
