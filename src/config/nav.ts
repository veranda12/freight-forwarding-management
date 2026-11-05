import type { PermissionKey } from "@/lib/permissions";
import {
  LayoutDashboard, Users, Building2, Globe2, Anchor, Coins, Tags, Container,
  Package, Percent, BookOpen, FileText, Briefcase, CalendarCheck, FileSignature,
  Calculator, Receipt, FileInput, StickyNote, Wallet, BookMarked, BarChart3,
  UserCog, Settings, History, MapPin, Truck, PackageCheck, Scale, Calculator as CalcIcon,
  ArrowLeftRight, BookCheck, Landmark, GitCompare, RefreshCw, Banknote, ArrowDownUp, NotebookPen, ListChecks, Bug, ShieldCheck,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Izin `*.view` yang dibutuhkan untuk melihat menu ini. */
  perm: PermissionKey;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export const NAV: NavGroup[] = [
  {
    label: "Utama",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, perm: "dashboard.view" },
    ],
  },
  {
    // Lini bisnis 1: forwarding internasional
    label: "Ekspor-Impor",
    items: [
      { label: "Rate Management", href: "/rates", icon: Tags, perm: "rates.view" },
      { label: "Quotation", href: "/quotations", icon: FileSignature, perm: "quotations.view" },
      { label: "Job / Shipment", href: "/jobs", icon: Briefcase, perm: "jobs.view" },
      { label: "Booking", href: "/bookings", icon: CalendarCheck, perm: "bookings.view" },
      { label: "Dokumentasi", href: "/documents", icon: FileText, perm: "documents.view" },
      { label: "Tracking", href: "/tracking", icon: MapPin, perm: "tracking.view" },
    ],
  },
  {
    // Lini bisnis 2: kargo domestik (antar kota) — data & alur terpisah
    label: "Domestik",
    items: [
      { label: "Pengiriman (STT)", href: "/domestic", icon: Truck, perm: "domestic.view" },
      { label: "Cek Tarif", href: "/domestic/check", icon: CalcIcon, perm: "domesticCheck.view" },
      { label: "Tarif Domestik", href: "/domestic/tariffs", icon: PackageCheck, perm: "domesticTariffs.view" },
    ],
  },
  {
    label: "Finance",
    items: [
      { label: "Costing", href: "/costing", icon: Calculator, perm: "costing.view" },
      { label: "Invoice (AR)", href: "/invoices", icon: Receipt, perm: "invoices.view" },
      { label: "Vendor Bill (AP)", href: "/bills", icon: FileInput, perm: "bills.view" },
      { label: "Debit/Credit Note", href: "/notes", icon: StickyNote, perm: "notes.view" },
      { label: "Receipt & Payment", href: "/payments", icon: Wallet, perm: "payments.view" },
      { label: "Accounting", href: "/accounting", icon: BookMarked, perm: "accounting.view" },
      { label: "Kas Masuk / Keluar", href: "/accounting/cash-entry", icon: ArrowDownUp, perm: "cashEntry.view" },
      { label: "Jurnal Manual", href: "/accounting/manual-journal", icon: NotebookPen, perm: "manualJournal.view" },
      { label: "Arus Kas", href: "/accounting/cash-flow", icon: ArrowLeftRight, perm: "cashFlow.view" },
      { label: "Tutup Buku", href: "/accounting/closing", icon: BookCheck, perm: "closing.view" },
      { label: "Aset Tetap", href: "/accounting/fixed-assets", icon: Building2, perm: "fixedAssets.view" },
      { label: "Pajak", href: "/accounting/tax", icon: Landmark, perm: "tax.view" },
      { label: "Rekonsiliasi Bank", href: "/accounting/bank-rec", icon: GitCompare, perm: "bankRec.view" },
      { label: "Revaluasi Kurs", href: "/accounting/fx", icon: RefreshCw, perm: "fx.view" },
    ],
  },
  {
    label: "Laporan",
    items: [
      { label: "Reporting", href: "/reports", icon: BarChart3, perm: "reports.view" },
    ],
  },
  {
    label: "Master Data",
    items: [
      { label: "Customer", href: "/customers", icon: Users, perm: "customers.view" },
      { label: "Vendor", href: "/vendors", icon: Building2, perm: "vendors.view" },
      { label: "Overseas Agent", href: "/agents", icon: Globe2, perm: "agents.view" },
      { label: "Port & Airport", href: "/ports", icon: Anchor, perm: "ports.view" },
      { label: "Kas & Rekening", href: "/bank-accounts", icon: Banknote, perm: "bankAccounts.view" },
      { label: "Armada Sendiri", href: "/vehicles", icon: Truck, perm: "vehicles.view" },
      { label: "Currency & Kurs", href: "/currencies", icon: Coins, perm: "currencies.view" },
      { label: "Charge Code", href: "/charges", icon: Tags, perm: "charges.view" },
      { label: "Rate Card", href: "/rate-card", icon: ListChecks, perm: "rateCard.view" },
      { label: "Aturan Berat", href: "/weight-rules", icon: Scale, perm: "weightRules.view" },
      { label: "Container Type", href: "/containers", icon: Container, perm: "containers.view" },
      { label: "Commodity", href: "/commodities", icon: Package, perm: "commodities.view" },
      { label: "Pajak", href: "/taxes", icon: Percent, perm: "taxes.view" },
      { label: "Chart of Accounts", href: "/coa", icon: BookOpen, perm: "coa.view" },
    ],
  },
  {
    label: "Sistem",
    items: [
      { label: "User Management", href: "/users", icon: UserCog, perm: "users.view" },
      { label: "Role Management", href: "/roles", icon: ShieldCheck, perm: "roles.view" },
      { label: "Audit Log", href: "/audit", icon: History, perm: "audit.view" },
      { label: "Log Error", href: "/logs", icon: Bug, perm: "logs.view" },
      { label: "Setting Perusahaan", href: "/settings", icon: Settings, perm: "settings.view" },
    ],
  },
];
