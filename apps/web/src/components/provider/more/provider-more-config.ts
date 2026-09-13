import type { LucideIcon } from "lucide-react";
import {
  Ban,
  BarChart3,
  BookOpen,
  Car,
  Compass,
  CreditCard,
  Flashlight,
  HelpCircle,
  Images,
  Languages,
  Layers,
  Lock,
  Megaphone,
  MessageSquare,
  Monitor,
  Package,
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
  labelKey: string;
  subtitle: string;
  subtitleKey: string;
  href: string;
  color: string;
  bg: string;
  featureFlag?: "payment_yoco" | "payment_paycloud" | "payment_paystack_virtual_terminal";
  permission?: MorePermissionGate;
};

export type MoreMenuSection = {
  title: string;
  titleKey: string;
  items: MoreMenuItem[];
};

export type MoreQuickAction = {
  icon: LucideIcon;
  label: string;
  labelKey: string;
  href: string;
  color: string;
  featureFlag?: MoreMenuItem["featureFlag"];
  permission?: MorePermissionGate;
};

/** Mirrors mobile `MENU_SECTIONS` — web routes are the portal equivalents. */
const MORE_TAB = "provider.mobile.screens.moreTab";

export const MORE_MENU_SECTIONS: MoreMenuSection[] = [
  {
    title: "Grow your business",
    titleKey: `${MORE_TAB}.sectionGrowBusiness`,
    items: [
      {
        icon: Megaphone,
        label: "Buy ads",
        labelKey: `${MORE_TAB}.adsLabel`,
        subtitle: "Sponsored listings, campaigns & reach",
        subtitleKey: `${MORE_TAB}.adsSubtitle`,
        href: "/provider/settings/ads",
        color: "#d97706",
        bg: "#fffbeb",
        permission: "edit_settings",
      },
      {
        icon: CreditCard,
        label: "Sell memberships",
        labelKey: `${MORE_TAB}.membershipsLabel`,
        subtitle: "Plans, benefits, pricing & subscribers",
        subtitleKey: `${MORE_TAB}.membershipsSubtitle`,
        href: "/provider/settings/services/memberships",
        color: "#7c3aed",
        bg: "#ede9fe",
      },
      {
        icon: Tag,
        label: "Promo codes",
        labelKey: `${MORE_TAB}.promoCodesLabel`,
        subtitle: "Your discounts—scoped to your bookings only",
        subtitleKey: `${MORE_TAB}.promoCodesSubtitle`,
        href: "/provider/promotions",
        color: "#ea580c",
        bg: "#fff7ed",
      },
    ],
  },
  {
    title: "Operations",
    titleKey: `${MORE_TAB}.sectionOperations`,
    items: [
      {
        icon: BookOpen,
        label: "Bookings & calendar",
        labelKey: `${MORE_TAB}.bookingsCalendarLabel`,
        subtitle: "Appointments, waitlist & schedule",
        subtitleKey: `${MORE_TAB}.bookingsCalendarSubtitle`,
        href: "/provider/bookings",
        color: "#6366f1",
        bg: "#eef2ff",
      },
      {
        icon: Ban,
        label: "Time blocks",
        labelKey: `${MORE_TAB}.timeBlocksLabel`,
        subtitle: "Breaks, meetings & unavailable periods",
        subtitleKey: `${MORE_TAB}.timeBlocksSubtitle`,
        href: "/provider/time-blocks",
        color: "#d97706",
        bg: "#fffbeb",
      },
      {
        icon: UsersRound,
        label: "Group Bookings",
        labelKey: `${MORE_TAB}.groupBookingsLabel`,
        subtitle: "Manage group appointments",
        subtitleKey: `${MORE_TAB}.groupBookingsSubtitle`,
        href: "/provider/group-bookings",
        color: "#8b5cf6",
        bg: "#ede9fe",
      },
      {
        icon: Wrench,
        label: "Resources & forms",
        labelKey: `${MORE_TAB}.resourcesFormsLabel`,
        subtitle: "Resources, intake & consent forms",
        subtitleKey: `${MORE_TAB}.resourcesFormsSubtitle`,
        href: "/provider/resources-forms",
        color: "#0d9488",
        bg: "#ccfbf1",
      },
      {
        icon: MessageSquare,
        label: "Custom Requests",
        labelKey: `${MORE_TAB}.customRequestsLabel`,
        subtitle: "Client quotes & offers",
        subtitleKey: `${MORE_TAB}.customRequestsSubtitle`,
        href: "/provider/custom-requests",
        color: "#f97316",
        bg: "#fff7ed",
      },
    ],
  },
  {
    title: "E-Commerce & Products",
    titleKey: `${MORE_TAB}.sectionEcommerce`,
    items: [
      {
        icon: Package,
        label: "Products & e-commerce",
        labelKey: `${MORE_TAB}.productsEcommerceLabel`,
        subtitle: "Inventory, orders & sales",
        subtitleKey: `${MORE_TAB}.productsEcommerceSubtitle`,
        href: "/provider/ecommerce",
        color: "#8b5cf6",
        bg: "#ede9fe",
        permission: "sales",
      },
    ],
  },
  {
    title: "Business",
    titleKey: `${MORE_TAB}.sectionBusiness`,
    items: [
      {
        icon: Layers,
        label: "Catalogue & offerings",
        labelKey: `${MORE_TAB}.catalogueLabel`,
        subtitle: "Services, products & packages",
        subtitleKey: `${MORE_TAB}.catalogueSubtitle`,
        href: "/provider/catalogue",
        color: "#ec4899",
        bg: "#fdf2f8",
      },
      {
        icon: Users,
        label: "Team & scheduling",
        labelKey: `${MORE_TAB}.teamSchedulingLabel`,
        subtitle: "Staff, shifts & time clock",
        subtitleKey: `${MORE_TAB}.teamSchedulingSubtitle`,
        href: "/provider/team",
        color: "#14b8a6",
        bg: "#ccfbf1",
      },
      {
        icon: Wallet,
        label: "Money",
        labelKey: `${MORE_TAB}.moneyLabel`,
        subtitle: "Earnings, ledger, sales & payouts",
        subtitleKey: `${MORE_TAB}.moneySubtitle`,
        href: "/provider/finance",
        color: "#22c55e",
        bg: "#f0fdf4",
        permission: "payouts",
      },
      {
        icon: Receipt,
        label: "Billing",
        labelKey: `${MORE_TAB}.billingLabel`,
        subtitle: "Plan, invoices, bills & VAT",
        subtitleKey: `${MORE_TAB}.billingSubtitle`,
        href: "/provider/settings/billing",
        color: "#8b5cf6",
        bg: "#ede9fe",
        permission: "edit_settings",
      },
      {
        icon: Users,
        label: "Team & pay",
        labelKey: `${MORE_TAB}.teamPayLabel`,
        subtitle: "Payroll, team totals & your earnings",
        subtitleKey: `${MORE_TAB}.teamPaySubtitle`,
        href: "/provider/team-pay",
        color: "#0d9488",
        bg: "#ccfbf1",
      },
      {
        icon: Settings,
        label: "Payment setup",
        labelKey: `${MORE_TAB}.paymentSetupLabel`,
        subtitle: "Payout accounts, terminals & gift cards",
        subtitleKey: `${MORE_TAB}.paymentSetupSubtitle`,
        href: "/provider/payment-setup",
        color: "#2563eb",
        bg: "#dbeafe",
        permission: "edit_settings",
      },
      {
        icon: BarChart3,
        label: "Reports",
        labelKey: `${MORE_TAB}.reportsLabel`,
        subtitle: "Analytics, activity & insights",
        subtitleKey: `${MORE_TAB}.reportsSubtitle`,
        href: "/provider/reports",
        color: "#3b82f6",
        bg: "#eff6ff",
        permission: "reports",
      },
      {
        icon: Images,
        label: "Gallery",
        labelKey: `${MORE_TAB}.galleryLabel`,
        subtitle: "Portfolio & photos",
        subtitleKey: `${MORE_TAB}.gallerySubtitle`,
        href: "/provider/settings/gallery",
        color: "#f43f5e",
        bg: "#fff1f2",
      },
    ],
  },
  {
    title: "Engagement",
    titleKey: `${MORE_TAB}.sectionEngagement`,
    items: [
      {
        icon: MessageSquare,
        label: "Engagement",
        labelKey: `${MORE_TAB}.engagementLabel`,
        subtitle: "Reviews, messaging & marketing",
        subtitleKey: `${MORE_TAB}.engagementSubtitle`,
        href: "/provider/engagement",
        color: "#6366f1",
        bg: "#eef2ff",
      },
      {
        icon: Compass,
        label: "Explore posts",
        labelKey: `${MORE_TAB}.explorePostsLabel`,
        subtitle: "Your feed posts, views & comments",
        subtitleKey: `${MORE_TAB}.explorePostsSubtitle`,
        href: "/provider/explore",
        color: "#a855f7",
        bg: "#faf5ff",
      },
    ],
  },
  {
    title: "Settings",
    titleKey: `${MORE_TAB}.sectionSettings`,
    items: [
      {
        icon: Lock,
        label: "Login & security",
        labelKey: `${MORE_TAB}.loginSecurityLabel`,
        subtitle: "Email, phone, password & sessions",
        subtitleKey: `${MORE_TAB}.loginSecuritySubtitle`,
        href: "/provider/account/login-and-security",
        color: "#6366f1",
        bg: "#eef2ff",
      },
      {
        icon: ShieldCheck,
        label: "Identity verification",
        labelKey: `${MORE_TAB}.identityVerificationLabel`,
        subtitle: "Verify your identity (KYC) & earn the Verified badge",
        subtitleKey: `${MORE_TAB}.identityVerificationSubtitle`,
        href: "/provider/settings/verification",
        color: "#0ea5e9",
        bg: "#e0f2fe",
      },
      {
        icon: Languages,
        label: "Language",
        labelKey: `${MORE_TAB}.languageRegionLabel`,
        subtitle: "App language & display currency",
        subtitleKey: `${MORE_TAB}.languageRegionSubtitle`,
        href: "/provider/account/preferences",
        color: "#0ea5e9",
        bg: "#e0f2fe",
      },
      {
        icon: Store,
        label: "Locations & operating hours",
        labelKey: `${MORE_TAB}.locationsHoursLabel`,
        subtitle: "Branches, addresses & opening times",
        subtitleKey: `${MORE_TAB}.locationsHoursSubtitle`,
        href: "/provider/locations",
        color: "#059669",
        bg: "#ecfdf5",
      },
      {
        icon: Car,
        label: "Travel fees",
        labelKey: `${MORE_TAB}.travelFeesLabel`,
        subtitle: "At-home travel fees",
        subtitleKey: `${MORE_TAB}.travelFeesSubtitle`,
        href: "/provider/settings/sales/travel-fees",
        color: "#f59e0b",
        bg: "#fef3c7",
      },
      {
        icon: XCircle,
        label: "Cancellation policies & fees",
        labelKey: `${MORE_TAB}.cancellationPoliciesLabel`,
        subtitle: "Late cancel & no-show fees",
        subtitleKey: `${MORE_TAB}.cancellationPoliciesSubtitle`,
        href: "/provider/settings/cancellation-policies",
        color: "#ef4444",
        bg: "#fee2e2",
      },
      {
        icon: Ribbon,
        label: "Rewards & badges",
        labelKey: `${MORE_TAB}.rewardsBadgesLabel`,
        subtitle: "Points, milestones & badge progress",
        subtitleKey: `${MORE_TAB}.rewardsBadgesSubtitle`,
        href: "/provider/gamification",
        color: "#059669",
        bg: "#d1fae5",
      },
      {
        icon: Ticket,
        label: "Support tickets",
        labelKey: `${MORE_TAB}.supportTicketsLabel`,
        subtitle: "All tickets, replies & status",
        subtitleKey: `${MORE_TAB}.supportTicketsSubtitle`,
        href: "/provider/support-tickets",
        color: "#0ea5e9",
        bg: "#e0f2fe",
      },
      {
        icon: Settings,
        label: "Settings & account",
        labelKey: `${MORE_TAB}.settingsAccountLabel`,
        subtitle: "Business, team & account",
        subtitleKey: `${MORE_TAB}.settingsAccountSubtitle`,
        href: "/provider/settings",
        color: "#6b7280",
        bg: "#f3f4f6",
      },
      {
        icon: HelpCircle,
        label: "Help & support",
        labelKey: `${MORE_TAB}.helpSupportLabel`,
        subtitle: "Contact support & new ticket",
        subtitleKey: `${MORE_TAB}.helpSupportSubtitle`,
        href: "/provider/support-tickets/new",
        color: "#0284c7",
        bg: "#e0f2fe",
      },
    ],
  },
];

/** Mirrors mobile `QUICK_ACTIONS` quick grid above the fold. */
export const MORE_QUICK_ACTIONS: MoreQuickAction[] = [
  { icon: BookOpen, label: "Bookings", labelKey: `${MORE_TAB}.qaBookings`, href: "/provider/bookings", color: "#6366f1" },
  { icon: Flashlight, label: "Express booking", labelKey: `${MORE_TAB}.qaExpressBooking`, href: "/provider/express-booking", color: "#f59e0b" },
  { icon: Monitor, label: "Front Desk", labelKey: `${MORE_TAB}.qaFrontDesk`, href: "/provider/front-desk", color: "#d97706" },
  { icon: MessageSquare, label: "Custom requests", labelKey: `${MORE_TAB}.qaCustomRequests`, href: "/provider/custom-requests", color: "#f97316" },
  { icon: Layers, label: "Catalogue", labelKey: `${MORE_TAB}.qaCatalogue`, href: "/provider/catalogue", color: "#ec4899" },
  {
    icon: Megaphone,
    label: "Buy ads",
    labelKey: `${MORE_TAB}.qaBuyAds`,
    href: "/provider/settings/ads",
    color: "#f59e0b",
    permission: "edit_settings",
  },
  {
    icon: CreditCard,
    label: "Memberships",
    labelKey: `${MORE_TAB}.qaMemberships`,
    href: "/provider/settings/services/memberships",
    color: "#7c3aed",
  },
  {
    icon: Smartphone,
    label: "Yoco",
    labelKey: `${MORE_TAB}.qaYoco`,
    href: "/provider/settings/sales/yoco-integration",
    color: "#2563eb",
    featureFlag: "payment_yoco",
    permission: "edit_settings",
  },
  {
    icon: Sparkles,
    label: "Card machines",
    labelKey: `${MORE_TAB}.qaCardMachines`,
    href: "/provider/settings/sales/card-machines",
    color: "#7c3aed",
    featureFlag: "payment_paycloud",
    permission: "edit_settings",
  },
  {
    icon: QrCode,
    label: "Paystack Terminal",
    labelKey: `${MORE_TAB}.qaPaystackTerminal`,
    href: "/provider/settings/sales/paystack-terminal",
    color: "#16a34a",
    featureFlag: "payment_paystack_virtual_terminal",
    permission: "edit_settings",
  },
  {
    icon: Ribbon,
    label: "Subscription",
    labelKey: `${MORE_TAB}.qaSubscription`,
    href: "/provider/subscription",
    color: "#8b5cf6",
    permission: "edit_settings",
  },
  {
    icon: PiggyBank,
    label: "Payouts",
    labelKey: `${MORE_TAB}.qaPayouts`,
    href: "/provider/finance?tab=payouts",
    color: "#047857",
    permission: "payouts",
  },
  {
    icon: Wallet,
    label: "Bank accounts",
    labelKey: `${MORE_TAB}.qaBankAccounts`,
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
