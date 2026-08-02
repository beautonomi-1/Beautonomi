import type { LucideIcon } from "lucide-react";
import {
  Ban,
  BarChart3,
  BookOpen,
  Car,
  Compass,
  CreditCard,
  Flashlight,
  Gift,
  Grid3x3,
  HelpCircle,
  Images,
  Languages,
  Layers,
  Lock,
  Megaphone,
  MessageSquare,
  Monitor,
  Package,
  Phone,
  PiggyBank,
  QrCode,
  Receipt,
  Ribbon,
  Settings,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Store,
  Tag,
  Ticket,
  Users,
  UsersRound,
  Wallet,
  Wrench,
  XCircle,
} from "lucide-react";
import type { StaffPermissions } from "@/lib/auth/permissions";

export type MorePermissionGate =
  | "edit_settings"
  | "payouts"
  | "reports"
  | "sales";

export type MoreMenuItem = {
  icon: LucideIcon;
  label: string;
  subtitle: string;
  href: string;
  color: string;
  bg: string;
  featureFlag?: "payment_yoco" | "payment_paycloud" | "payment_paystack_virtual_terminal";
  permission?: MorePermissionGate;
};

export type MoreMenuSection = {
  title: string;
  items: MoreMenuItem[];
};

export type MoreQuickAction = {
  icon: LucideIcon;
  label: string;
  href: string;
  color: string;
  featureFlag?: MoreMenuItem["featureFlag"];
  permission?: MorePermissionGate;
};

/** Mirrors mobile `MENU_SECTIONS` — web routes are the portal equivalents. */
export const MORE_MENU_SECTIONS: MoreMenuSection[] = [
  {
    title: "Grow your business",
    items: [
      {
        icon: Megaphone,
        label: "Buy ads",
        subtitle: "Sponsored listings, campaigns & reach",
        href: "/provider/settings/ads",
        color: "#d97706",
        bg: "#fffbeb",
        permission: "edit_settings",
      },
      {
        icon: CreditCard,
        label: "Sell memberships",
        subtitle: "Plans, benefits, pricing & subscribers",
        href: "/provider/settings/services/memberships",
        color: "#7c3aed",
        bg: "#ede9fe",
      },
      {
        icon: Tag,
        label: "Promo codes",
        subtitle: "Your discounts—scoped to your bookings only",
        href: "/provider/promotions",
        color: "#ea580c",
        bg: "#fff7ed",
      },
    ],
  },
  {
    title: "Operations",
    items: [
      {
        icon: BookOpen,
        label: "Bookings & calendar",
        subtitle: "Appointments, waitlist & schedule",
        href: "/provider/bookings",
        color: "#6366f1",
        bg: "#eef2ff",
      },
      {
        icon: Ban,
        label: "Time blocks",
        subtitle: "Breaks, meetings & unavailable periods",
        href: "/provider/time-blocks",
        color: "#d97706",
        bg: "#fffbeb",
      },
      {
        icon: UsersRound,
        label: "Group Bookings",
        subtitle: "Manage group appointments",
        href: "/provider/group-bookings",
        color: "#8b5cf6",
        bg: "#ede9fe",
      },
      {
        icon: Wrench,
        label: "Resources & forms",
        subtitle: "Resources, intake & consent forms",
        href: "/provider/resources-forms",
        color: "#0d9488",
        bg: "#ccfbf1",
      },
      {
        icon: MessageSquare,
        label: "Custom Requests",
        subtitle: "Client quotes & offers",
        href: "/provider/custom-requests",
        color: "#f97316",
        bg: "#fff7ed",
      },
    ],
  },
  {
    title: "E-Commerce & Products",
    items: [
      {
        icon: Package,
        label: "Products & e-commerce",
        subtitle: "Inventory, orders & sales",
        href: "/provider/ecommerce",
        color: "#8b5cf6",
        bg: "#ede9fe",
        permission: "sales",
      },
    ],
  },
  {
    title: "Business",
    items: [
      {
        icon: Layers,
        label: "Catalogue & offerings",
        subtitle: "Services, products & packages",
        href: "/provider/catalogue",
        color: "#ec4899",
        bg: "#fdf2f8",
      },
      {
        icon: Users,
        label: "Team & scheduling",
        subtitle: "Staff, shifts & time clock",
        href: "/provider/team",
        color: "#14b8a6",
        bg: "#ccfbf1",
      },
      {
        icon: Wallet,
        label: "Money",
        subtitle: "Earnings, ledger, sales & payouts",
        href: "/provider/finance",
        color: "#22c55e",
        bg: "#f0fdf4",
        permission: "payouts",
      },
      {
        icon: Receipt,
        label: "Billing",
        subtitle: "Plan, invoices, bills & VAT",
        href: "/provider/settings/billing",
        color: "#8b5cf6",
        bg: "#ede9fe",
        permission: "edit_settings",
      },
      {
        icon: Users,
        label: "Team & pay",
        subtitle: "Payroll, team totals & your earnings",
        href: "/provider/team-pay",
        color: "#0d9488",
        bg: "#ccfbf1",
      },
      {
        icon: Settings,
        label: "Payment setup",
        subtitle: "Payout accounts, terminals & gift cards",
        href: "/provider/payment-setup",
        color: "#2563eb",
        bg: "#dbeafe",
        permission: "edit_settings",
      },
      {
        icon: BarChart3,
        label: "Reports",
        subtitle: "Analytics, activity & insights",
        href: "/provider/reports",
        color: "#3b82f6",
        bg: "#eff6ff",
        permission: "reports",
      },
      {
        icon: Images,
        label: "Gallery",
        subtitle: "Portfolio & photos",
        href: "/provider/settings/gallery",
        color: "#f43f5e",
        bg: "#fff1f2",
      },
    ],
  },
  {
    title: "Engagement",
    items: [
      {
        icon: MessageSquare,
        label: "Engagement",
        subtitle: "Reviews, messaging & marketing",
        href: "/provider/engagement",
        color: "#6366f1",
        bg: "#eef2ff",
      },
      {
        icon: Compass,
        label: "Explore posts",
        subtitle: "Your feed posts, views & comments",
        href: "/provider/explore",
        color: "#a855f7",
        bg: "#faf5ff",
      },
    ],
  },
  {
    title: "Settings",
    items: [
      {
        icon: Lock,
        label: "Login & security",
        subtitle: "Email, phone, password & sessions",
        href: "/provider/account/login-and-security",
        color: "#6366f1",
        bg: "#eef2ff",
      },
      {
        icon: ShieldCheck,
        label: "Identity verification",
        subtitle: "Verify your identity (KYC) & earn the Verified badge",
        href: "/provider/settings/verification",
        color: "#0ea5e9",
        bg: "#e0f2fe",
      },
      {
        icon: Languages,
        label: "Language & region",
        subtitle: "App language & market entry point",
        href: "/provider/account/preferences",
        color: "#0ea5e9",
        bg: "#e0f2fe",
      },
      {
        icon: Store,
        label: "Locations & operating hours",
        subtitle: "Branches, addresses & opening times",
        href: "/provider/locations",
        color: "#059669",
        bg: "#ecfdf5",
      },
      {
        icon: Car,
        label: "Travel fees",
        subtitle: "At-home travel fees",
        href: "/provider/settings/sales/travel-fees",
        color: "#f59e0b",
        bg: "#fef3c7",
      },
      {
        icon: XCircle,
        label: "Cancellation policies & fees",
        subtitle: "Late cancel & no-show fees",
        href: "/provider/settings/cancellation-policies",
        color: "#ef4444",
        bg: "#fee2e2",
      },
      {
        icon: Ribbon,
        label: "Rewards & badges",
        subtitle: "Points, milestones & badge progress",
        href: "/provider/gamification",
        color: "#059669",
        bg: "#d1fae5",
      },
      {
        icon: Ticket,
        label: "Support tickets",
        subtitle: "All tickets, replies & status",
        href: "/provider/support-tickets",
        color: "#0ea5e9",
        bg: "#e0f2fe",
      },
      {
        icon: Settings,
        label: "Settings & account",
        subtitle: "Business, team & account",
        href: "/provider/settings",
        color: "#6b7280",
        bg: "#f3f4f6",
      },
      {
        icon: HelpCircle,
        label: "Help & support",
        subtitle: "Contact support & new ticket",
        href: "/provider/support-tickets/new",
        color: "#0284c7",
        bg: "#e0f2fe",
      },
    ],
  },
];

/** Mirrors mobile `QUICK_ACTIONS` quick grid above the fold. */
export const MORE_QUICK_ACTIONS: MoreQuickAction[] = [
  { icon: BookOpen, label: "Bookings", href: "/provider/bookings", color: "#6366f1" },
  { icon: Flashlight, label: "Express booking", href: "/provider/express-booking", color: "#f59e0b" },
  { icon: Monitor, label: "Front Desk", href: "/provider/front-desk", color: "#d97706" },
  { icon: MessageSquare, label: "Custom requests", href: "/provider/custom-requests", color: "#f97316" },
  { icon: Layers, label: "Catalogue", href: "/provider/catalogue", color: "#ec4899" },
  {
    icon: Megaphone,
    label: "Buy ads",
    href: "/provider/settings/ads",
    color: "#f59e0b",
    permission: "edit_settings",
  },
  {
    icon: CreditCard,
    label: "Memberships",
    href: "/provider/settings/services/memberships",
    color: "#7c3aed",
  },
  {
    icon: Smartphone,
    label: "Yoco",
    href: "/provider/settings/sales/yoco-integration",
    color: "#2563eb",
    featureFlag: "payment_yoco",
    permission: "edit_settings",
  },
  {
    icon: Sparkles,
    label: "Card machines",
    href: "/provider/settings/sales/card-machines",
    color: "#7c3aed",
    featureFlag: "payment_paycloud",
    permission: "edit_settings",
  },
  {
    icon: QrCode,
    label: "Paystack Terminal",
    href: "/provider/settings/sales/paystack-terminal",
    color: "#16a34a",
    featureFlag: "payment_paystack_virtual_terminal",
    permission: "edit_settings",
  },
  {
    icon: Ribbon,
    label: "Subscription",
    href: "/provider/subscription",
    color: "#8b5cf6",
    permission: "edit_settings",
  },
  {
    icon: PiggyBank,
    label: "Payouts",
    href: "/provider/finance?tab=payouts",
    color: "#047857",
    permission: "payouts",
  },
  {
    icon: Wallet,
    label: "Bank accounts",
    href: "/provider/settings/payout-accounts",
    color: "#059669",
    permission: "edit_settings",
  },
];

export type ProviderNavCounts = {
  pending_bookings: number;
  active_product_orders: number;
  unread_messages: number;
  waiting_room: number;
  open_return_requests?: number;
  pending_custom_requests?: number;
};

export function formatBadgeCount(count: number): string | null {
  if (count <= 0) return null;
  return count > 99 ? "99+" : String(count);
}

export function getRouteBadgeCount(route: string, navCounts: ProviderNavCounts | null): number {
  if (!navCounts) return 0;
  if (route.includes("/bookings")) {
    return Number(navCounts.pending_bookings ?? 0) + Number(navCounts.waiting_room ?? 0);
  }
  if (
    route.includes("/ecommerce") ||
    route.includes("product-orders") ||
    route.includes("orders")
  ) {
    return (
      Number(navCounts.active_product_orders ?? 0) +
      Number(navCounts.open_return_requests ?? 0)
    );
  }
  if (route.includes("/engagement") || route.includes("/messaging")) {
    return Number(navCounts.unread_messages ?? 0);
  }
  if (route.includes("custom-requests")) {
    return Number(navCounts.pending_custom_requests ?? 0);
  }
  if (route.includes("front-desk") || route.includes("waiting-room")) {
    return Number(navCounts.waiting_room ?? 0);
  }
  return 0;
}

export function passesMorePermissionGate(
  permission: MorePermissionGate | undefined,
  opts: {
    isOwner: boolean;
    permissions: StaffPermissions | null;
    canRequestPayouts: boolean;
    canViewSales: boolean;
  },
): boolean {
  if (!permission) return true;
  const { isOwner, permissions, canRequestPayouts, canViewSales } = opts;
  if (isOwner) return true;

  switch (permission) {
    case "edit_settings":
      return permissions?.edit_settings === true;
    case "payouts":
      return canRequestPayouts || permissions?.edit_settings === true;
    case "reports":
      return permissions?.view_reports === true;
    case "sales":
      return canViewSales;
    default:
      return true;
  }
}

export function passesFeatureFlag(
  flag: MoreMenuItem["featureFlag"],
  flags: {
    paystackTerminalEnabled: boolean;
    yocoEnabled: boolean;
    paycloudEnabled: boolean;
  },
): boolean {
  if (!flag) return true;
  if (flag === "payment_paystack_virtual_terminal") return flags.paystackTerminalEnabled;
  if (flag === "payment_yoco") return flags.yocoEnabled;
  if (flag === "payment_paycloud") return flags.paycloudEnabled;
  return true;
}
