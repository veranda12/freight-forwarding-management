import type { Resource } from "@/lib/rbac";
import {
  LayoutDashboard, Users, Building2, Globe2, Anchor, Coins, Tags, Container,
  Package, Percent, BookOpen, FileText, Briefcase, CalendarCheck, FileSignature,
  Calculator, Receipt, FileInput, StickyNote, Wallet, BookMarked, BarChart3,
  UserCog, Settings, History, MapPin,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  resource: Resource;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export const NAV: NavGroup[] = [
  {
    label: "Utama",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, resource: "dashboard" },
    ],
  },
  {
    label: "Sales",
    items: [
      { label: "Rate Management", href: "/rates", icon: Tags, resource: "rates" },
      { label: "Quotation", href: "/quotations", icon: FileSignature, resource: "quotations" },
    ],
  },
  {
    label: "Operasional",
    items: [
      { label: "Job / Shipment", href: "/jobs", icon: Briefcase, resource: "jobs" },
      { label: "Booking", href: "/bookings", icon: CalendarCheck, resource: "bookings" },
      { label: "Dokumentasi", href: "/documents", icon: FileText, resource: "documents" },
      { label: "Tracking", href: "/tracking", icon: MapPin, resource: "tracking" },
    ],
  },
  {
    label: "Finance",
    items: [
      { label: "Costing", href: "/costing", icon: Calculator, resource: "costing" },
      { label: "Invoice (AR)", href: "/invoices", icon: Receipt, resource: "invoices" },
      { label: "Vendor Bill (AP)", href: "/bills", icon: FileInput, resource: "bills" },
      { label: "Debit/Credit Note", href: "/notes", icon: StickyNote, resource: "notes" },
      { label: "Receipt & Payment", href: "/payments", icon: Wallet, resource: "payments" },
      { label: "Accounting", href: "/accounting", icon: BookMarked, resource: "accounting" },
    ],
  },
  {
    label: "Laporan",
    items: [
      { label: "Reporting", href: "/reports", icon: BarChart3, resource: "reports" },
    ],
  },
  {
    label: "Master Data",
    items: [
      { label: "Customer", href: "/customers", icon: Users, resource: "customers" },
      { label: "Vendor", href: "/vendors", icon: Building2, resource: "vendors" },
      { label: "Overseas Agent", href: "/agents", icon: Globe2, resource: "agents" },
      { label: "Port & Airport", href: "/ports", icon: Anchor, resource: "ports" },
      { label: "Currency & Kurs", href: "/currencies", icon: Coins, resource: "currencies" },
      { label: "Charge Code", href: "/charges", icon: Tags, resource: "charges" },
      { label: "Container Type", href: "/containers", icon: Container, resource: "containers" },
      { label: "Commodity", href: "/commodities", icon: Package, resource: "commodities" },
      { label: "Pajak", href: "/taxes", icon: Percent, resource: "taxes" },
      { label: "Chart of Accounts", href: "/coa", icon: BookOpen, resource: "coa" },
    ],
  },
  {
    label: "Sistem",
    items: [
      { label: "User Management", href: "/users", icon: UserCog, resource: "users" },
      { label: "Audit Log", href: "/audit", icon: History, resource: "audit" },
      { label: "Setting Perusahaan", href: "/settings", icon: Settings, resource: "settings" },
    ],
  },
];
