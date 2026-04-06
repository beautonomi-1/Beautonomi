import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Building2,
  Calendar,
  Image as ImageIcon,
  Tag,
  Gift,
  FileText,
  Users,
  DollarSign,
  Wallet,
  Award,
  Bell,
  Settings,
  Globe,
  Globe2,
  Map,
  ShieldCheck,
  ToggleLeft,
  CreditCard,
  Eye,
  Star,
  AlertCircle,
  Flag,
  RotateCcw,
  BarChart3,
  Activity,
  Shield,
  Receipt,
  UserCheck,
  MessageSquare,
  TrendingUp,
  Zap,
  Coins,
  Medal,
  ShoppingBag,
  Undo2,
  Store,
  Layers,
  GraduationCap,
  Smartphone,
  Link2,
  Network,
} from "lucide-react";
import type { AdminSection } from "@beautonomi/admin-access";
import {
  ADMIN_SECTION_OVERVIEW,
  ADMIN_SECTION_SUPPORT,
  ADMIN_SECTION_PROVIDERS_OPERATIONS,
  ADMIN_SECTION_FINANCE,
  ADMIN_SECTION_USERS_TRUST,
  ADMIN_SECTION_CONTENT_CATALOG,
  ADMIN_SECTION_ECOMMERCE,
  ADMIN_SECTION_MARKETING_COMMS,
  ADMIN_SECTION_INTEGRATIONS_DEV,
  ADMIN_SECTION_OPERATIONS,
  ADMIN_SECTION_PLATFORM_CONFIG,
} from "@beautonomi/admin-access";

export interface NavItemConfig {
  title: string;
  href: string;
  icon: LucideIcon;
  superadminOnly?: boolean;
}

export interface NavGroupConfig {
  label: string;
  section: AdminSection;
  items: NavItemConfig[];
}

/** Mirrors apps/web/src/components/admin/AdminShell.tsx navGroups (Wave 0 subset + full list for continuity). */
export const NAV_GROUPS: NavGroupConfig[] = [
  {
    label: "Overview",
    section: ADMIN_SECTION_OVERVIEW,
    items: [
      { title: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
      { title: "Gods Eye", href: "/admin/gods-eye", icon: Eye },
      { title: "Analytics", href: "/admin/analytics", icon: BarChart3 },
      { title: "Reports", href: "/admin/reports", icon: FileText },
    ],
  },
  {
    label: "Support",
    section: ADMIN_SECTION_SUPPORT,
    items: [{ title: "Support Tickets", href: "/admin/support-tickets", icon: AlertCircle }],
  },
  {
    label: "Providers & operations",
    section: ADMIN_SECTION_PROVIDERS_OPERATIONS,
    items: [
      { title: "Providers", href: "/admin/providers", icon: Building2 },
      { title: "Staff", href: "/admin/staff", icon: UserCheck },
      { title: "Bookings", href: "/admin/bookings", icon: Calendar },
      { title: "Reviews", href: "/admin/reviews", icon: Star },
      { title: "Disputes", href: "/admin/disputes", icon: AlertCircle },
      { title: "User Reports", href: "/admin/user-reports", icon: Flag },
      { title: "Refunds", href: "/admin/refunds", icon: RotateCcw },
    ],
  },
  {
    label: "Finance",
    section: ADMIN_SECTION_FINANCE,
    items: [
      { title: "Finance", href: "/admin/finance", icon: DollarSign },
      { title: "Payouts", href: "/admin/payouts", icon: Wallet },
      { title: "Fee Management", href: "/admin/fees", icon: CreditCard },
      { title: "Platform Fees", href: "/admin/settings/platform-fees", icon: DollarSign },
      { title: "Taxes", href: "/admin/taxes", icon: Receipt },
      { title: "Plans", href: "/admin/plans", icon: CreditCard },
      { title: "Provider Subscriptions", href: "/admin/provider-subscriptions", icon: CreditCard },
      { title: "Subscription Revenue", href: "/admin/subscription-revenue", icon: TrendingUp },
      { title: "Billing", href: "/admin/billing", icon: CreditCard },
    ],
  },
  {
    label: "Users & trust",
    section: ADMIN_SECTION_USERS_TRUST,
    items: [
      { title: "Users", href: "/admin/users", icon: Users },
      { title: "Verifications", href: "/admin/verifications", icon: ShieldCheck },
      { title: "Audit Logs", href: "/admin/audit-logs", icon: FileText },
    ],
  },
  {
    label: "Content & catalog",
    section: ADMIN_SECTION_CONTENT_CATALOG,
    items: [
      { title: "Content", href: "/admin/content", icon: FileText },
      { title: "Learning Center", href: "/admin/content/learning", icon: GraduationCap },
      { title: "Catalog", href: "/admin/catalog", icon: Tag },
      { title: "Explore", href: "/admin/explore", icon: ImageIcon },
    ],
  },
  {
    label: "E-commerce",
    section: ADMIN_SECTION_ECOMMERCE,
    items: [
      { title: "Product Orders", href: "/admin/ecommerce/orders", icon: ShoppingBag },
      { title: "Product Returns", href: "/admin/ecommerce/returns", icon: Undo2 },
      { title: "Product Catalog", href: "/admin/ecommerce/products", icon: Store },
    ],
  },
  {
    label: "Marketing & comms",
    section: ADMIN_SECTION_MARKETING_COMMS,
    items: [
      { title: "Promotions", href: "/admin/promotions", icon: Gift },
      { title: "Loyalty", href: "/admin/loyalty", icon: Award },
      { title: "Point rules", href: "/admin/gamification/point-rules", icon: Coins },
      { title: "Provider badges", href: "/admin/gamification/badges", icon: Medal },
      { title: "Gift Cards", href: "/admin/gift-cards", icon: Gift },
      { title: "Notifications", href: "/admin/notifications", icon: Bell },
      { title: "Broadcast", href: "/admin/broadcast", icon: MessageSquare },
      { title: "Marketing Automations", href: "/admin/automations", icon: Zap },
      { title: "Notification Templates", href: "/admin/notification-templates", icon: Bell },
    ],
  },
  {
    label: "Integrations & dev",
    section: ADMIN_SECTION_INTEGRATIONS_DEV,
    items: [
      { title: "Webhooks", href: "/admin/webhooks", icon: Globe },
      { title: "API Keys", href: "/admin/api-keys", icon: Shield },
      { title: "Amplitude", href: "/admin/integrations/amplitude", icon: BarChart3 },
      { title: "Mapbox", href: "/admin/mapbox", icon: Map },
      { title: "ISO Codes", href: "/admin/iso-codes", icon: Globe },
    ],
  },
  {
    label: "Operations",
    section: ADMIN_SECTION_OPERATIONS,
    items: [
      { title: "Market Coverage", href: "/admin/service-zones", icon: Globe2, superadminOnly: true },
      { title: "System Health", href: "/admin/system-health", icon: Activity },
      { title: "Monitoring", href: "/admin/monitoring", icon: Activity },
      { title: "Security", href: "/admin/security", icon: Shield },
    ],
  },
  {
    label: "Platform config",
    section: ADMIN_SECTION_PLATFORM_CONFIG,
    items: [
      { title: "Settings", href: "/admin/settings", icon: Settings },
      { title: "Tenant domains", href: "/admin/settings/tenant-domains", icon: Network, superadminOnly: true },
      { title: "Control Plane", href: "/admin/control-plane/overview", icon: Layers },
      { title: "Feature Flags", href: "/admin/settings/feature-flags", icon: ToggleLeft },
      { title: "Custom Fields", href: "/admin/custom-fields", icon: FileText },
      { title: "App Version", href: "/admin/settings/app-version", icon: Smartphone },
      { title: "Referral Settings", href: "/admin/settings/referrals", icon: Link2 },
      { title: "Team permissions", href: "/admin/settings/team-permissions", icon: Shield, superadminOnly: true },
    ],
  },
];
