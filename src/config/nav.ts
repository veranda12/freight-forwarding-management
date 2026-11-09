import type { Resource } from "@/lib/rbac";
import {
  LayoutDashboard, Users, Building2, Globe2, Anchor, Coins, Tags, Container,
  Package, Percent, BookOpen, FileText, Briefcase, CalendarCheck, FileSignature,
  Calculator, Receipt, FileInput, StickyNote, Wallet, BookMarked, BarChart3,
  UserCog, Settings, History, MapPin, Truck, PackageCheck, Scale, Calculator as CalcIcon,
  ArrowLeftRight, BookCheck, Landmark, GitCompare, RefreshCw, Banknote, ArrowDownUp, NotebookPen, ListChecks, Bug, Ticket, FileSearch,
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
    // Lini bisnis 1: forwarding internasional
    label: "Ekspor-Impor",
    items: [
      { label: "Rate Management", href: "/rates", icon: Tags, resource: "rates" },
      { label: "Quotation", href: "/quotations", icon: FileSignature, resource: "quotations" },
      { label: "Job / Shipment", href: "/jobs", icon: Briefcase, resource: "jobs" },
      { label: "Booking", href: "/bookings", icon: CalendarCheck, resource: "bookings" },
      { label: "Dokumentasi", href: "/documents", icon: FileText, resource: "documents" },
      { label: "Tracking", href: "/tracking", icon: MapPin, resource: "tracking" },
    ],
  },
  {
    // Lini bisnis 2: kargo domestik (antar kota) — data & alur terpisah
    label: "Domestik",
    items: [
      { label: "Pengiriman (STT)", href: "/domestic", icon: Truck, resource: "domestic" },
      { label: "Cek Tarif", href: "/domestic/check", icon: CalcIcon, resource: "domesticTariffs" },
      { label: "Tarif Domestik", href: "/domestic/tariffs", icon: PackageCheck, resource: "domesticTariffs" },
    ],
  },
  {
    label: "Finance",
    items: [
      { label: "Cari Bukti", href: "/proofs", icon: FileSearch, resource: "proofs" },
      { label: "Costing", href: "/costing", icon: Calculator, resource: "costing" },
      { label: "Invoice (AR)", href: "/invoices", icon: Receipt, resource: "invoices" },
      { label: "Vendor Bill (AP)", href: "/bills", icon: FileInput, resource: "bills" },
      { label: "Voucher", href: "/vouchers", icon: Ticket, resource: "vouchers" },
      { label: "Debit/Credit Note", href: "/notes", icon: StickyNote, resource: "notes" },
      { label: "Receipt & Payment", href: "/payments", icon: Wallet, resource: "payments" },
      { label: "Accounting", href: "/accounting", icon: BookMarked, resource: "accounting" },
      { label: "Jurnal Penerimaan & Pengeluaran", href: "/accounting/cash-entry", icon: ArrowDownUp, resource: "accounting" },
      { label: "Jurnal Umum", href: "/accounting/manual-journal", icon: NotebookPen, resource: "accounting" },
      { label: "Kasir All", href: "/accounting/kasir", icon: ListChecks, resource: "accounting" },
      { label: "Arus Kas", href: "/accounting/cash-flow", icon: ArrowLeftRight, resource: "accounting" },
      { label: "Tutup Buku", href: "/accounting/closing", icon: BookCheck, resource: "accounting" },
      { label: "Aset Tetap", href: "/accounting/fixed-assets", icon: Building2, resource: "accounting" },
      { label: "Pajak", href: "/accounting/tax", icon: Landmark, resource: "accounting" },
      { label: "Rekonsiliasi Bank", href: "/accounting/bank-rec", icon: GitCompare, resource: "accounting" },
      { label: "Revaluasi Kurs", href: "/accounting/fx", icon: RefreshCw, resource: "accounting" },
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
      { label: "Kas & Rekening", href: "/bank-accounts", icon: Banknote, resource: "accounting" },
      { label: "Armada Sendiri", href: "/vehicles", icon: Truck, resource: "vehicles" },
      { label: "Currency & Kurs", href: "/currencies", icon: Coins, resource: "currencies" },
      { label: "Charge Code", href: "/charges", icon: Tags, resource: "charges" },
      { label: "Rate Card", href: "/rate-card", icon: ListChecks, resource: "charges" },
      { label: "Aturan Berat", href: "/weight-rules", icon: Scale, resource: "weightRules" },
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
      { label: "Log Error", href: "/logs", icon: Bug, resource: "audit" },
      { label: "Setting Perusahaan", href: "/settings", icon: Settings, resource: "settings" },
    ],
  },
];
