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
  Scale,
  UserCheck,
  Terminal,
  Package,
  ShoppingCart,
  Megaphone,
  PieChart,
  MessageSquare,
  MessageCircle,
  Phone,
  TrendingUp,
  Zap,
  Medal,
  Mail,
  ShoppingBag,
  Undo2,
  Store,
  Layers,
  GraduationCap,
  Smartphone,
  Link2,
  Network,
  Share2,
  MapPinned,
  Boxes,
  ShieldAlert,
  Ban,
  Radio,
  ClipboardList,
  Clock,
  GitMerge,
  CheckCircle2,
  Columns3,
  Plug,
  Sparkles,
  Bot,
  ScrollText,
  BookOpen,
  Lock,
  ListFilter,
  Truck,
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
  ADMIN_SECTION_PROVIDER_OPS,
  ADMIN_SECTION_COMMERCIAL,
} from "@beautonomi/admin-access";

export interface NavItemConfig {
  title: string;
  href: string;
  icon: LucideIcon;
  /** RBAC section governing visibility of this specific item. */
  section: AdminSection;
  /** Hide from non-superadmin users regardless of section access. */
  superadminOnly?: boolean;
  /**
   * When set, renders a visual divider label immediately before this item
   * in the sidebar (collapsed mode hides the label but keeps the divider gap).
   */
  subheader?: string;
  /** Nested sub-pages shown under an expandable hub row in the sidebar. */
  children?: NavItemConfig[];
}

export interface NavGroupConfig {
  label: string;
  items: NavItemConfig[];
}

export type FlatNavItem = NavItemConfig & { groupLabel: string; depth: number };

/** Depth-first flattening for search, command palette, and route audits. */
export function flattenNavItems(groups: NavGroupConfig[]): FlatNavItem[] {
  const out: FlatNavItem[] = [];
  for (const group of groups) {
    const walk = (items: NavItemConfig[], depth: number) => {
      for (const item of items) {
        out.push({ ...item, groupLabel: group.label, depth });
        if (item.children?.length) walk(item.children, depth + 1);
      }
    };
    walk(group.items, 0);
  }
  return out;
}

/** RBAC-filter a nav tree; keeps hub rows when any child is visible. */
export function filterNavTree(
  item: NavItemConfig,
  opts: { isSuperadmin: boolean; canAccess: (section: AdminSection) => boolean },
): NavItemConfig | null {
  if (item.superadminOnly && !opts.isSuperadmin) return null;
  const filteredChildren = (item.children ?? [])
    .map((child) => filterNavTree(child, opts))
    .filter((child): child is NavItemConfig => child != null);
  const selfVisible = opts.canAccess(item.section);
  if (!selfVisible && filteredChildren.length === 0) return null;
  return {
    ...item,
    children: filteredChildren.length > 0 ? filteredChildren : undefined,
  };
}

/** Badge count for a nav row: leaves use API counts; hubs sum visible children. */
export function navItemBadgeCount(item: NavItemConfig, navCounts: Record<string, number>): number {
  const children = item.children ?? [];
  if (children.length === 0) return navCounts[item.href] ?? 0;
  return children.reduce((sum, child) => sum + navItemBadgeCount(child, navCounts), 0);
}

/**
 * Navigation model ordered by daily admin frequency.
 *
 * RBAC is enforced per item via `item.section`. Hub rows may expose `children`
 * for specialist pages without lengthening the top-level sidebar.
 */
export const NAV_GROUPS: NavGroupConfig[] = [
  // ─── 1. Overview ──────────────────────────────────────────────────────────
  {
    label: "Overview",
    items: [
      { title: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard, section: ADMIN_SECTION_OVERVIEW },
      { title: "Notifications", href: "/admin/notifications/inbox", icon: Bell, section: ADMIN_SECTION_OVERVIEW },
      { title: "Analytics", href: "/admin/analytics", icon: BarChart3, section: ADMIN_SECTION_OVERVIEW, superadminOnly: true },
      { title: "Geo & Devices", href: "/admin/analytics/geo", icon: Globe2, section: ADMIN_SECTION_OVERVIEW, superadminOnly: true },
      { title: "Overview Reports", href: "/admin/reports", icon: FileText, section: ADMIN_SECTION_OVERVIEW },
    ],
  },

  // ─── 2. Support ───────────────────────────────────────────────────────────
  {
    label: "Support",
    items: [
      { title: "Support Tickets", href: "/admin/support-tickets", icon: AlertCircle, section: ADMIN_SECTION_SUPPORT },
      { title: "Support AI drafts", href: "/admin/support-tickets/ai-drafts", icon: Bot, section: ADMIN_SECTION_SUPPORT },
      { title: "Knowledge Base", href: "/admin/knowledge-base", icon: BookOpen, section: ADMIN_SECTION_OVERVIEW },
    ],
  },

  // ─── 3. Provider Ops ──────────────────────────────────────────────────────
  {
    label: "Provider Ops",
    items: [
      {
        title: "Provider Ops Dashboard",
        href: "/admin/provider-ops",
        icon: Radio,
        section: ADMIN_SECTION_PROVIDER_OPS,
        children: [
          { title: "Provider AI queue", href: "/admin/provider-ops/ai-queue", icon: Bot, section: ADMIN_SECTION_PROVIDER_OPS },
          { title: "Lead Inbox", href: "/admin/provider-ops/leads", icon: UserCheck, section: ADMIN_SECTION_PROVIDER_OPS },
          { title: "Pipeline Board", href: "/admin/provider-ops/pipeline", icon: Columns3, section: ADMIN_SECTION_PROVIDER_OPS },
          { title: "Onboarding Tracker", href: "/admin/provider-ops/tracker", icon: ClipboardList, section: ADMIN_SECTION_PROVIDER_OPS },
          { title: "Activation Queue", href: "/admin/provider-ops/activation", icon: CheckCircle2, section: ADMIN_SECTION_PROVIDER_OPS },
          { title: "Duplicate Review", href: "/admin/provider-ops/duplicates", icon: GitMerge, section: ADMIN_SECTION_PROVIDER_OPS },
          { title: "Provider Ops Reports", href: "/admin/provider-ops/reports", icon: BarChart3, section: ADMIN_SECTION_PROVIDER_OPS },
          { title: "Provider Ops Settings", href: "/admin/provider-ops/settings", icon: Settings, section: ADMIN_SECTION_PROVIDER_OPS },
        ],
      },
    ],
  },

  // ─── 4. Providers ─────────────────────────────────────────────────────────
  {
    label: "Providers",
    items: [
      { title: "Providers", href: "/admin/providers", icon: Building2, section: ADMIN_SECTION_PROVIDERS_OPERATIONS },
      { title: "Bookings", href: "/admin/bookings", icon: Calendar, section: ADMIN_SECTION_PROVIDERS_OPERATIONS },
      { title: "Group Bookings", href: "/admin/group-bookings", icon: Users, section: ADMIN_SECTION_PROVIDERS_OPERATIONS },
      { title: "Provider Distance", href: "/admin/providers/distance-settings", icon: MapPinned, section: ADMIN_SECTION_PROVIDERS_OPERATIONS },
      { title: "Staff", href: "/admin/staff", icon: UserCheck, section: ADMIN_SECTION_PROVIDERS_OPERATIONS },
      { title: "Referral Sources", href: "/admin/referral-sources", icon: Share2, section: ADMIN_SECTION_PROVIDERS_OPERATIONS },
    ],
  },

  // ─── 5. Finance ───────────────────────────────────────────────────────────
  {
    label: "Finance",
    items: [
      {
        title: "Finance",
        href: "/admin/finance",
        icon: DollarSign,
        section: ADMIN_SECTION_FINANCE,
        children: [
          { title: "Finance AI queue", href: "/admin/finance/ai-queue", icon: Bot, section: ADMIN_SECTION_FINANCE },
          { title: "Payouts", href: "/admin/payouts", icon: Wallet, section: ADMIN_SECTION_FINANCE },
          { title: "Refunds", href: "/admin/refunds", icon: RotateCcw, section: ADMIN_SECTION_FINANCE },
          { title: "Fee Management", href: "/admin/fees", icon: CreditCard, section: ADMIN_SECTION_FINANCE },
          { title: "Taxes", href: "/admin/taxes", icon: Receipt, section: ADMIN_SECTION_FINANCE },
          { title: "Period Locks", href: "/admin/period-locks", icon: Lock, section: ADMIN_SECTION_FINANCE },
          { title: "Trial Balance", href: "/admin/trial-balance", icon: Scale, section: ADMIN_SECTION_FINANCE },
          { title: "Wallet Reconciliation", href: "/admin/wallet-reconciliation", icon: Wallet, section: ADMIN_SECTION_FINANCE },
          { title: "FX rates", href: "/admin/fx-rates", icon: TrendingUp, section: ADMIN_SECTION_FINANCE },
          { title: "Paystack Terminal", href: "/admin/paystack-terminal", icon: CreditCard, section: ADMIN_SECTION_FINANCE },
          { title: "Platform Fees", href: "/admin/settings/platform-fees", icon: DollarSign, section: ADMIN_SECTION_FINANCE, superadminOnly: true },
          { title: "Reconciliation Exceptions", href: "/admin/reconciliation-exceptions", icon: AlertCircle, section: ADMIN_SECTION_FINANCE, superadminOnly: true },
          { title: "Ledger Repair", href: "/admin/ledger-repair", icon: GitMerge, section: ADMIN_SECTION_FINANCE, superadminOnly: true },
          { title: "Ledger Health", href: "/admin/ledger-health", icon: Activity, section: ADMIN_SECTION_FINANCE, superadminOnly: true },
          { title: "Provider Subscriptions", href: "/admin/provider-subscriptions", icon: CreditCard, section: ADMIN_SECTION_FINANCE, superadminOnly: true, subheader: "Subscriptions & Plans" },
          { title: "Subscription Revenue", href: "/admin/subscription-revenue", icon: TrendingUp, section: ADMIN_SECTION_FINANCE, superadminOnly: true },
          { title: "Plans & Pricing", href: "/admin/plans", icon: CreditCard, section: ADMIN_SECTION_FINANCE, superadminOnly: true },
          { title: "Apple IAP Setup Sheet", href: "/admin/monetization/apple/setup-sheet", icon: Smartphone, section: ADMIN_SECTION_FINANCE, superadminOnly: true, subheader: "Apple IAP" },
          { title: "Apple IAP Products", href: "/admin/monetization/apple/products", icon: Smartphone, section: ADMIN_SECTION_FINANCE, superadminOnly: true },
          { title: "Apple IAP Transactions", href: "/admin/monetization/apple/transactions", icon: Smartphone, section: ADMIN_SECTION_FINANCE, superadminOnly: true },
          { title: "Apple IAP Notifications", href: "/admin/monetization/apple/notifications", icon: Smartphone, section: ADMIN_SECTION_FINANCE, superadminOnly: true },
          { title: "Apple IAP Settlements", href: "/admin/monetization/apple/settlements", icon: Smartphone, section: ADMIN_SECTION_FINANCE, superadminOnly: true },
          { title: "Billing", href: "/admin/billing", icon: CreditCard, section: ADMIN_SECTION_FINANCE, superadminOnly: true },
        ],
      },
    ],
  },

  // ─── 6. Trust & Safety ────────────────────────────────────────────────────
  {
    label: "Trust & Safety",
    items: [
      {
        title: "Trust & Safety Ops",
        href: "/admin/trust-safety-ops",
        icon: ShieldAlert,
        section: ADMIN_SECTION_USERS_TRUST,
        children: [
          { title: "Trust AI queue", href: "/admin/trust-safety-ops/ai-queue", icon: Bot, section: ADMIN_SECTION_USERS_TRUST },
          { title: "Disputes", href: "/admin/disputes", icon: AlertCircle, section: ADMIN_SECTION_PROVIDERS_OPERATIONS },
          { title: "Reviews & Ratings", href: "/admin/reviews", icon: Star, section: ADMIN_SECTION_PROVIDERS_OPERATIONS },
          { title: "User Reports", href: "/admin/user-reports", icon: Flag, section: ADMIN_SECTION_USERS_TRUST },
          { title: "Blocked Users", href: "/admin/user-blocks", icon: Ban, section: ADMIN_SECTION_USERS_TRUST },
          { title: "Content Reports", href: "/admin/content-reports", icon: Flag, section: ADMIN_SECTION_USERS_TRUST },
          { title: "Fraud Cases", href: "/admin/fraud-cases", icon: ShieldAlert, section: ADMIN_SECTION_USERS_TRUST },
          { title: "Identity Verifications (legacy)", href: "/admin/verifications", icon: ShieldCheck, section: ADMIN_SECTION_USERS_TRUST },
          { title: "Identity & Trust — Sessions", href: "/admin/identity-trust/sessions", icon: ShieldCheck, section: ADMIN_SECTION_USERS_TRUST, superadminOnly: true },
          { title: "Safety Logs", href: "/admin/control-plane/safety-logs", icon: ScrollText, section: ADMIN_SECTION_OPERATIONS, superadminOnly: true },
        ],
      },
    ],
  },

  // ─── 7. Users ─────────────────────────────────────────────────────────────
  {
    label: "Users",
    items: [
      { title: "Customers & Users", href: "/admin/users", icon: Users, section: ADMIN_SECTION_USERS_TRUST },
      { title: "Audit Logs", href: "/admin/audit-logs", icon: FileText, section: ADMIN_SECTION_USERS_TRUST },
    ],
  },

  // ─── 8. Commerce & Catalog ────────────────────────────────────────────────
  {
    label: "Commerce & Catalog",
    items: [
      { title: "E-commerce", href: "/admin/ecommerce", icon: BarChart3, section: ADMIN_SECTION_ECOMMERCE },
      { title: "Product Orders", href: "/admin/ecommerce/orders", icon: ShoppingBag, section: ADMIN_SECTION_ECOMMERCE },
      { title: "Product Returns", href: "/admin/ecommerce/returns", icon: Undo2, section: ADMIN_SECTION_ECOMMERCE },
      { title: "Product Catalog", href: "/admin/ecommerce/products", icon: Store, section: ADMIN_SECTION_ECOMMERCE },
      { title: "Add-ons", href: "/admin/addons", icon: Boxes, section: ADMIN_SECTION_ECOMMERCE },
      { title: "Service Catalog", href: "/admin/catalog", icon: Tag, section: ADMIN_SECTION_CONTENT_CATALOG, subheader: "Service Catalog" },
      { title: "Global Categories", href: "/admin/catalog/global-categories", icon: Globe2, section: ADMIN_SECTION_CONTENT_CATALOG },
      { title: "Gift Cards", href: "/admin/gift-cards", icon: Gift, section: ADMIN_SECTION_MARKETING_COMMS },
    ],
  },

  // ─── 9. Marketing ─────────────────────────────────────────────────────────
  {
    label: "Marketing",
    items: [
      {
        title: "Marketing Ops",
        href: "/admin/marketing",
        icon: Megaphone,
        section: ADMIN_SECTION_MARKETING_COMMS,
        children: [
          { title: "Broadcast", href: "/admin/broadcast", icon: MessageSquare, section: ADMIN_SECTION_MARKETING_COMMS },
          { title: "Promotions", href: "/admin/promotions", icon: Gift, section: ADMIN_SECTION_MARKETING_COMMS },
          { title: "Notification Templates", href: "/admin/notification-templates", icon: Bell, section: ADMIN_SECTION_MARKETING_COMMS },
          { title: "Email Templates", href: "/admin/email-templates", icon: Mail, section: ADMIN_SECTION_MARKETING_COMMS },
          { title: "SMS Templates", href: "/admin/sms-templates", icon: MessageSquare, section: ADMIN_SECTION_MARKETING_COMMS },
        ],
      },
      { title: "Ads & Campaigns", href: "/admin/ads", icon: MessageSquare, section: ADMIN_SECTION_MARKETING_COMMS, superadminOnly: true },
      { title: "Loyalty", href: "/admin/loyalty", icon: Award, section: ADMIN_SECTION_MARKETING_COMMS },
      { title: "Gamification", href: "/admin/gamification", icon: Medal, section: ADMIN_SECTION_MARKETING_COMMS },
      { title: "Automations", href: "/admin/automations", icon: Zap, section: ADMIN_SECTION_MARKETING_COMMS },
      { title: "Marketing Pricebook", href: "/admin/marketing-pricebook", icon: ListFilter, section: ADMIN_SECTION_MARKETING_COMMS },
    ],
  },

  // ─── 10. Communications ───────────────────────────────────────────────────
  {
    label: "Communications",
    items: [
      { title: "Notification Center", href: "/admin/notifications", icon: Bell, section: ADMIN_SECTION_MARKETING_COMMS },
      { title: "WhatsApp Content Templates", href: "/admin/whatsapp-content-templates", icon: MessageCircle, section: ADMIN_SECTION_MARKETING_COMMS },
      { title: "WhatsApp Session Templates", href: "/admin/whatsapp/templates", icon: MessageCircle, section: ADMIN_SECTION_INTEGRATIONS_DEV },
      { title: "WhatsApp Sessions", href: "/admin/whatsapp/sessions", icon: Radio, section: ADMIN_SECTION_INTEGRATIONS_DEV },
    ],
  },

  // ─── 11. Content ──────────────────────────────────────────────────────────
  {
    label: "Content",
    items: [
      { title: "Content Hub", href: "/admin/content", icon: FileText, section: ADMIN_SECTION_CONTENT_CATALOG },
      { title: "Learning Center", href: "/admin/content/learning", icon: GraduationCap, section: ADMIN_SECTION_CONTENT_CATALOG },
      { title: "CMS Resources", href: "/admin/content/resources", icon: Layers, section: ADMIN_SECTION_CONTENT_CATALOG },
      { title: "FAQs", href: "/admin/content/faqs", icon: MessageCircle, section: ADMIN_SECTION_CONTENT_CATALOG },
      { title: "Explore Feed", href: "/admin/explore", icon: ImageIcon, section: ADMIN_SECTION_CONTENT_CATALOG },
    ],
  },

  // ─── 12. Integrations ─────────────────────────────────────────────────────
  {
    label: "Integrations",
    items: [
      {
        title: "Integrations",
        href: "/admin/integrations-hub",
        icon: Plug,
        section: ADMIN_SECTION_INTEGRATIONS_DEV,
        children: [
          { title: "Webhooks", href: "/admin/webhooks", icon: Plug, section: ADMIN_SECTION_INTEGRATIONS_DEV },
          { title: "API Keys", href: "/admin/api-keys", icon: Shield, section: ADMIN_SECTION_INTEGRATIONS_DEV },
          { title: "Paystack", href: "/admin/integrations/paystack", icon: CreditCard, section: ADMIN_SECTION_INTEGRATIONS_DEV },
          { title: "Resend", href: "/admin/integrations/resend", icon: Mail, section: ADMIN_SECTION_INTEGRATIONS_DEV },
          { title: "Slack", href: "/admin/integrations/slack", icon: MessageSquare, section: ADMIN_SECTION_INTEGRATIONS_DEV },
          { title: "Calls (Voice / Salestrail)", href: "/admin/integrations/calls", icon: Phone, section: ADMIN_SECTION_INTEGRATIONS_DEV, superadminOnly: true },
          { title: "Amplitude", href: "/admin/integrations/amplitude", icon: BarChart3, section: ADMIN_SECTION_INTEGRATIONS_DEV },
          { title: "Flutterwave", href: "/admin/integrations/flutterwave", icon: CreditCard, section: ADMIN_SECTION_INTEGRATIONS_DEV, superadminOnly: true },
          { title: "Singular", href: "/admin/integrations/singular", icon: Share2, section: ADMIN_SECTION_INTEGRATIONS_DEV, superadminOnly: true },
          { title: "OneSignal", href: "/admin/integrations/onesignal", icon: Bell, section: ADMIN_SECTION_INTEGRATIONS_DEV, superadminOnly: true },
          { title: "Mapbox", href: "/admin/mapbox", icon: Map, section: ADMIN_SECTION_INTEGRATIONS_DEV },
          { title: "ISO Codes", href: "/admin/iso-codes", icon: Globe, section: ADMIN_SECTION_INTEGRATIONS_DEV },
          { title: "Yoco Web POS", href: "/admin/integrations/yoco", icon: Smartphone, section: ADMIN_SECTION_INTEGRATIONS_DEV, superadminOnly: true, subheader: "Advanced" },
          { title: "PayCloud Card Machines", href: "/admin/integrations/paycloud", icon: Terminal, section: ADMIN_SECTION_INTEGRATIONS_DEV, superadminOnly: true },
          { title: "PayCloud Operations", href: "/admin/integrations/paycloud-operations", icon: Terminal, section: ADMIN_SECTION_INTEGRATIONS_DEV, superadminOnly: true },
          { title: "Apple App Store Connect", href: "/admin/integrations/apple", icon: Smartphone, section: ADMIN_SECTION_INTEGRATIONS_DEV, superadminOnly: true },
          { title: "Courier shipping", href: "/admin/integrations/shipping", icon: Truck, section: ADMIN_SECTION_INTEGRATIONS_DEV, superadminOnly: true },
          { title: "Integrations Hub", href: "/admin/control-plane/integrations", icon: Plug, section: ADMIN_SECTION_INTEGRATIONS_DEV, superadminOnly: true },
          { title: "Didit (Identity / KYC)", href: "/admin/control-plane/integrations/didit", icon: ShieldCheck, section: ADMIN_SECTION_INTEGRATIONS_DEV, superadminOnly: true },
          { title: "AI Platform", href: "/admin/control-plane/integrations/ai", icon: Sparkles, section: ADMIN_SECTION_INTEGRATIONS_DEV, superadminOnly: true },
          { title: "Agentic Console", href: "/admin/control-plane/modules/agents", icon: Bot, section: ADMIN_SECTION_INTEGRATIONS_DEV, superadminOnly: true },
          { title: "Aura (trust & safety)", href: "/admin/control-plane/integrations/aura", icon: Zap, section: ADMIN_SECTION_INTEGRATIONS_DEV, superadminOnly: true },
        ],
      },
    ],
  },

  // ─── 13. Commercial Operations ────────────────────────────────────────────
  {
    label: "Commercial Operations",
    items: [
      { title: "Terminal Insights", href: "/admin/commercial/terminal-insights", icon: Terminal, section: ADMIN_SECTION_COMMERCIAL },
      { title: "Terminal Onboarding", href: "/admin/commercial/terminal-onboarding", icon: Terminal, section: ADMIN_SECTION_COMMERCIAL },
      { title: "Terminal Products", href: "/admin/commercial/terminal-products", icon: Package, section: ADMIN_SECTION_COMMERCIAL },
      { title: "Terminal Orders", href: "/admin/commercial/terminal-orders", icon: ShoppingCart, section: ADMIN_SECTION_COMMERCIAL },
      { title: "Terminal Campaigns", href: "/admin/commercial/terminal-campaigns", icon: Megaphone, section: ADMIN_SECTION_COMMERCIAL },
      { title: "Terminal Reporting", href: "/admin/commercial/terminal-reporting", icon: PieChart, section: ADMIN_SECTION_COMMERCIAL },
      { title: "Terminal Vendors", href: "/admin/commercial/terminal-vendors", icon: Terminal, section: ADMIN_SECTION_COMMERCIAL },
      { title: "Pickup Locations", href: "/admin/commercial/terminal-collection-locations", icon: MapPinned, section: ADMIN_SECTION_COMMERCIAL },
    ],
  },

  // ─── 14. Platform & Access ────────────────────────────────────────────────
  {
    label: "Platform & Access",
    items: [
      {
        title: "Platform Config",
        href: "/admin/platform-config",
        icon: Settings,
        section: ADMIN_SECTION_PLATFORM_CONFIG,
        children: [
          { title: "Feature Flags", href: "/admin/settings/feature-flags", icon: ToggleLeft, section: ADMIN_SECTION_PLATFORM_CONFIG },
          { title: "Admin Team", href: "/admin/settings/admin-team", icon: UserCheck, section: ADMIN_SECTION_PLATFORM_CONFIG, superadminOnly: true },
          { title: "Roles & Permissions", href: "/admin/settings/team-permissions", icon: Shield, section: ADMIN_SECTION_PLATFORM_CONFIG, superadminOnly: true },
          { title: "General Settings", href: "/admin/settings", icon: Settings, section: ADMIN_SECTION_PLATFORM_CONFIG },
        ],
      },
      { title: "App Version", href: "/admin/settings/app-version", icon: Smartphone, section: ADMIN_SECTION_PLATFORM_CONFIG },
      { title: "Custom Fields", href: "/admin/settings/custom-fields", icon: FileText, section: ADMIN_SECTION_PLATFORM_CONFIG },
      { title: "Referral Settings", href: "/admin/settings/referrals", icon: Link2, section: ADMIN_SECTION_PLATFORM_CONFIG },
      {
        title: "Operations",
        href: "/admin/operations",
        icon: Activity,
        section: ADMIN_SECTION_OPERATIONS,
        children: [
          { title: "Platform Health", href: "/admin/system-health", icon: Activity, section: ADMIN_SECTION_OPERATIONS },
          { title: "Market Coverage", href: "/admin/service-zones", icon: Globe2, section: ADMIN_SECTION_OPERATIONS },
          { title: "Security Policy", href: "/admin/security", icon: Shield, section: ADMIN_SECTION_OPERATIONS },
          { title: "Gods Eye", href: "/admin/gods-eye", icon: Eye, section: ADMIN_SECTION_OPERATIONS, superadminOnly: true },
        ],
      },
      { title: "Cron runs", href: "/admin/cron-runs", icon: Clock, section: ADMIN_SECTION_OPERATIONS, superadminOnly: true },
      { title: "Workflow runs", href: "/admin/workflow-runs", icon: GitMerge, section: ADMIN_SECTION_OPERATIONS, superadminOnly: true },
      { title: "Inbound webhooks", href: "/admin/webhooks/inbound", icon: Radio, section: ADMIN_SECTION_OPERATIONS, superadminOnly: true },
      { title: "Markets", href: "/admin/settings/tenants", icon: Network, section: ADMIN_SECTION_PLATFORM_CONFIG, superadminOnly: true, subheader: "Platform (Superadmin)" },
      { title: "Tenant Domains", href: "/admin/settings/tenant-domains", icon: Network, section: ADMIN_SECTION_PLATFORM_CONFIG, superadminOnly: true },
      { title: "Platform Advanced", href: "/admin/control-plane/overview", icon: Layers, section: ADMIN_SECTION_PLATFORM_CONFIG, superadminOnly: true },
      { title: "Compliance Purge", href: "/admin/control-plane/compliance", icon: ShieldAlert, section: ADMIN_SECTION_PLATFORM_CONFIG, superadminOnly: true },
      { title: "Tenant Reset", href: "/admin/control-plane/tenant-reset", icon: ShieldAlert, section: ADMIN_SECTION_PLATFORM_CONFIG, superadminOnly: true },
    ],
  },
];
