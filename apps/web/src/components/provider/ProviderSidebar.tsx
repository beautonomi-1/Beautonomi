"use client";

import React from "react";
import Link from "next/link";
import { ProviderOrgSwitcher } from "@/components/provider/ProviderOrgSwitcher";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Calendar,
  Tag,
  Grid3x3,
  Megaphone,
  Users,
  Settings,
  LogOut,
  UsersRound,
  Star,
  MessageSquare,
  Wallet,
  DollarSign,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  UserCheck,
  BarChart3,
  Sparkles,
  Trophy,
  ShoppingBag,
  Undo2,
  Truck,
  Store,
  CalendarRange,
  CalendarOff,
  Repeat,
  Package,
  FileEdit,
  HelpCircle,
  Ticket,
  Link2,
  Monitor,
  Target,
  Coins,
  PiggyBank,
  CreditCard,
  QrCode,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useProviderSidebar } from "@/contexts/ProviderSidebarContext";
import { useAuth } from "@/providers/AuthProvider";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { FEATURE_FLAG_KEYS } from "@/lib/server/feature-flag-keys";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { usePlatformSettings } from "@/providers/PlatformSettingsProvider";
import PlatformLogo from "@/components/platform/PlatformLogo";
import { usePermissions } from "@/hooks/usePermissions";
import type { StaffPermissions } from "@/lib/auth/permissions";
import { useTranslation } from "@beautonomi/i18n";
import { useLocale } from "@/components/i18n/LocaleProvider";

type NavItemConfig = {
  icon: React.ElementType;
  labelKey: string;
  href: string;
  badge?: boolean;
  permission?: keyof StaffPermissions;
  featureFlag?: "payment_yoco" | "payment_paystack_virtual_terminal" | "payment_paycloud" | typeof FEATURE_FLAG_KEYS.PROVIDER_UNIFIED_POS;
};

// Navigation sections with permission requirements
const navigationSections: { titleKey: string; items: NavItemConfig[] }[] = [
  {
    titleKey: "web.provider.sidebar.sections.main",
    items: [
      { icon: LayoutDashboard, labelKey: "web.provider.sidebar.items.dashboard", href: "/provider/dashboard", permission: undefined },
      { icon: Calendar, labelKey: "web.provider.sidebar.items.calendar", href: "/provider/calendar", badge: true, permission: "view_calendar" as keyof StaffPermissions },
      { icon: CalendarCheck, labelKey: "web.provider.sidebar.items.bookings", href: "/provider/bookings", permission: "view_calendar" as keyof StaffPermissions },
    ],
  },
  {
    titleKey: "web.provider.sidebar.sections.operations",
    items: [
      { icon: Clock, labelKey: "web.provider.sidebar.items.waitlist", href: "/provider/waitlist", permission: "view_calendar" as keyof StaffPermissions },
      { icon: Repeat, labelKey: "web.provider.sidebar.items.recurring", href: "/provider/recurring-appointments", permission: "view_calendar" as keyof StaffPermissions },
      { icon: UsersRound, labelKey: "web.provider.sidebar.items.groupBookings", href: "/provider/group-bookings", permission: "view_calendar" as keyof StaffPermissions },
      { icon: Monitor, labelKey: "web.provider.sidebar.items.frontDesk", href: "/provider/front-desk", permission: "view_calendar" as keyof StaffPermissions },
      { icon: UserCheck, labelKey: "web.provider.sidebar.items.waitingRoom", href: "/provider/waiting-room", permission: "view_calendar" as keyof StaffPermissions },
      { icon: UsersRound, labelKey: "web.provider.sidebar.items.clients", href: "/provider/clients", permission: "view_clients" as keyof StaffPermissions },
    ],
  },
  {
    titleKey: "web.provider.sidebar.sections.schedule",
    items: [
      { icon: Calendar, labelKey: "web.provider.sidebar.items.schedule", href: "/provider/schedule", permission: "view_calendar" as keyof StaffPermissions },
      { icon: Clock, labelKey: "web.provider.sidebar.items.operatingHours", href: "/provider/settings/operating-hours", permission: "edit_settings" as keyof StaffPermissions },
      { icon: CalendarRange, labelKey: "web.provider.sidebar.items.shifts", href: "/provider/team/shifts", permission: "view_team" as keyof StaffPermissions },
      { icon: CalendarRange, labelKey: "web.provider.sidebar.items.timeBlocks", href: "/provider/time-blocks", permission: "view_calendar" as keyof StaffPermissions },
      { icon: CalendarOff, labelKey: "web.provider.sidebar.items.daysOff", href: "/provider/team/days-off", permission: "view_calendar" as keyof StaffPermissions },
      { icon: CalendarOff, labelKey: "web.provider.sidebar.items.closedPeriods", href: "/provider/settings/appointment-activity/closed-periods", permission: "edit_settings" as keyof StaffPermissions },
    ],
  },
  {
    titleKey: "web.provider.sidebar.sections.resourcesForms",
    items: [
      { icon: Grid3x3, labelKey: "web.provider.sidebar.items.resourcesForms", href: "/provider/resources-forms", permission: "edit_settings" as keyof StaffPermissions },
      { icon: Package, labelKey: "web.provider.sidebar.items.resources", href: "/provider/resources", permission: "edit_settings" as keyof StaffPermissions },
      { icon: FileEdit, labelKey: "web.provider.sidebar.items.forms", href: "/provider/forms", permission: "edit_settings" as keyof StaffPermissions },
    ],
  },
  {
    titleKey: "web.provider.sidebar.sections.orders",
    items: [
      { icon: ShoppingBag, labelKey: "web.provider.sidebar.items.orders", href: "/provider/ecommerce/orders", permission: "view_sales" as keyof StaffPermissions },
      { icon: Undo2, labelKey: "web.provider.sidebar.items.returns", href: "/provider/ecommerce/returns", permission: "view_sales" as keyof StaffPermissions },
    ],
  },
  {
    titleKey: "web.provider.sidebar.sections.ecommerce",
    items: [
      { icon: Store, labelKey: "web.provider.sidebar.items.ecommerce", href: "/provider/ecommerce", permission: "view_products" as keyof StaffPermissions },
      { icon: Store, labelKey: "web.provider.sidebar.items.products", href: "/provider/ecommerce/products", permission: "view_products" as keyof StaffPermissions },
      { icon: Truck, labelKey: "web.provider.sidebar.items.shippingCollection", href: "/provider/ecommerce/shipping", permission: "edit_settings" as keyof StaffPermissions },
    ],
  },
  {
    titleKey: "web.provider.sidebar.sections.business",
    items: [
      { icon: Tag, labelKey: "web.provider.sidebar.items.sales", href: "/provider/sales", permission: "view_sales" as keyof StaffPermissions, featureFlag: FEATURE_FLAG_KEYS.PROVIDER_UNIFIED_POS },
      { icon: Wallet, labelKey: "web.provider.sidebar.items.finance", href: "/provider/finance", permission: "view_sales" as keyof StaffPermissions },
      { icon: PiggyBank, labelKey: "web.provider.sidebar.items.bankAccounts", href: "/provider/settings/payout-accounts", permission: "edit_settings" as keyof StaffPermissions },
      { icon: CreditCard, labelKey: "web.provider.sidebar.items.cardMachines", href: "/provider/settings/sales/card-machines", permission: "edit_settings" as keyof StaffPermissions, featureFlag: "payment_paycloud" },
      { icon: CreditCard, labelKey: "web.provider.sidebar.items.yoco", href: "/provider/settings/sales/yoco-integration", permission: "edit_settings" as keyof StaffPermissions, featureFlag: "payment_yoco" },
      { icon: QrCode, labelKey: "web.provider.sidebar.items.paystackTerminal", href: "/provider/settings/sales/paystack-terminal", permission: "edit_settings" as keyof StaffPermissions, featureFlag: "payment_paystack_virtual_terminal" },
      { icon: CreditCard, labelKey: "web.provider.sidebar.items.subscription", href: "/provider/subscription", permission: undefined },
      { icon: BarChart3, labelKey: "web.provider.sidebar.items.analytics", href: "/provider/analytics", permission: "view_reports" as keyof StaffPermissions },
      { icon: BarChart3, labelKey: "web.provider.sidebar.items.reports", href: "/provider/reports", permission: "view_reports" as keyof StaffPermissions },
      { icon: Trophy, labelKey: "web.provider.sidebar.items.rewardsBadges", href: "/provider/gamification", permission: undefined },
      { icon: Grid3x3, labelKey: "web.provider.sidebar.items.catalogue", href: "/provider/catalogue", permission: "view_products" as keyof StaffPermissions },
      { icon: Sparkles, labelKey: "web.provider.sidebar.items.packages", href: "/provider/packages", permission: "view_services" as keyof StaffPermissions },
      { icon: Ticket, labelKey: "web.provider.sidebar.items.memberships", href: "/provider/settings/services/memberships", permission: "view_services" as keyof StaffPermissions },
    ],
  },
  {
    titleKey: "web.provider.sidebar.sections.teamMarketing",
    items: [
      { icon: Sparkles, labelKey: "web.provider.sidebar.items.exploreContent", href: "/provider/explore", permission: "create_explore_posts" as keyof StaffPermissions },
      { icon: Users, labelKey: "web.provider.sidebar.items.team", href: "/provider/team", permission: "view_team" as keyof StaffPermissions },
      { icon: Users, labelKey: "web.provider.sidebar.items.teamMembers", href: "/provider/team/members", permission: "view_team" as keyof StaffPermissions },
      { icon: PiggyBank, labelKey: "web.provider.sidebar.items.payroll", href: "/provider/team/payroll", permission: "view_team" as keyof StaffPermissions },
      { icon: DollarSign, labelKey: "web.provider.sidebar.items.myEarnings", href: "/provider/team/my-earnings", permission: "view_sales" as keyof StaffPermissions },
      { icon: Star, labelKey: "web.provider.sidebar.items.reviews", href: "/provider/reviews", permission: "view_reviews" as keyof StaffPermissions },
      { icon: MessageSquare, labelKey: "web.provider.sidebar.items.messages", href: "/provider/messaging", permission: "view_messages" as keyof StaffPermissions },
      { icon: Megaphone, labelKey: "web.provider.sidebar.items.marketing", href: "/provider/marketing/automations", permission: "edit_settings" as keyof StaffPermissions },
      { icon: Target, labelKey: "web.provider.sidebar.items.paidAds", href: "/provider/settings/ads", permission: "edit_settings" as keyof StaffPermissions },
      { icon: Link2, labelKey: "web.provider.sidebar.items.bookingLinks", href: "/provider/express-booking", permission: "edit_settings" as keyof StaffPermissions },
    ],
  },
];

const bottomItems = [
  { icon: HelpCircle, labelKey: "web.provider.sidebar.items.helpSupport", href: "/help" },
  { icon: Ticket, labelKey: "web.provider.sidebar.items.myTickets", href: "/help/my-tickets" },
  { icon: Settings, labelKey: "web.provider.sidebar.items.settings", href: "/provider/settings" },
];

type ProviderNavCounts = {
  pending_bookings: number;
  active_product_orders: number;
  unread_messages: number;
  waiting_room: number;
  critical_total: number;
};

const emptyNavCounts: ProviderNavCounts = {
  pending_bookings: 0,
  active_product_orders: 0,
  unread_messages: 0,
  waiting_room: 0,
  critical_total: 0,
};

const formatNavCount = (count: number): string => (count > 99 ? "99+" : String(count));

// Match routes including sub-routes
const isActiveRoute = (pathname: string, href: string) => {
  // E-Commerce hub is active only on exact path, not on /ecommerce/orders etc.
  if (href === "/provider/ecommerce") {
    return pathname === "/provider/ecommerce" || pathname === "/provider/ecommerce/";
  }
  if (href.startsWith("/provider/ecommerce")) {
    return pathname.startsWith(href);
  }
  if (href === "/provider/catalogue") {
    return pathname.startsWith("/provider/catalogue");
  }
  if (href === "/provider/marketing/automations") {
    return pathname.startsWith("/provider/marketing");
  }
  if (href === "/provider/explore") {
    return pathname.startsWith("/provider/explore");
  }
  if (href === "/provider/team") {
    return pathname === "/provider/team" || pathname === "/provider/team/"
      || (pathname.startsWith("/provider/team/") && !pathname.startsWith("/provider/team/members")
        && !pathname.startsWith("/provider/team/days-off") && !pathname.startsWith("/provider/team/my-earnings")
        && !pathname.startsWith("/provider/team/payroll") && !pathname.startsWith("/provider/team/shifts"));
  }
  if (href === "/provider/team/days-off") {
    return pathname.startsWith("/provider/team/days-off");
  }
  if (href === "/provider/team/members") {
    return pathname.startsWith("/provider/team/members");
  }
  if (href === "/provider/team/payroll") {
    return pathname.startsWith("/provider/team/payroll");
  }
  if (href === "/provider/team/my-earnings") {
    return pathname.startsWith("/provider/team/my-earnings");
  }
  if (href === "/provider/time-blocks") {
    return pathname.startsWith("/provider/time-blocks");
  }
  if (href === "/provider/resources") {
    return pathname.startsWith("/provider/resources");
  }
  if (href === "/provider/forms") {
    return pathname.startsWith("/provider/forms");
  }
  if (href === "/provider/schedule") {
    return pathname === "/provider/schedule" || pathname.startsWith("/provider/schedule/");
  }
  if (href === "/provider/resources-forms") {
    return pathname === "/provider/resources-forms" || pathname.startsWith("/provider/resources-forms/");
  }
  if (href === "/provider/settings") {
    return pathname.startsWith("/provider/settings");
  }
  if (href === "/provider/reports") {
    return pathname.startsWith("/provider/reports");
  }
  if (href === "/provider/gamification") {
    return pathname.startsWith("/provider/gamification");
  }
  if (href === "/provider/finance") {
    return (
      pathname.startsWith("/provider/finance") ||
      pathname.startsWith("/provider/payouts") ||
      pathname.startsWith("/provider/payments")
    );
  }
  if (href === "/provider/subscription") {
    return pathname.startsWith("/provider/subscription");
  }
  if (href === "/provider/settings/payout-accounts") {
    return pathname.startsWith("/provider/settings/payout-accounts");
  }
  if (href === "/provider/settings/sales/yoco-integration") {
    return pathname.startsWith("/provider/settings/sales/yoco");
  }
  if (href === "/provider/settings/sales/paystack-terminal") {
    return pathname.startsWith("/provider/settings/sales/paystack-terminal");
  }
  if (href === "/provider/settings/services/memberships") {
    return pathname.startsWith("/provider/settings/services/memberships");
  }
  if (href === "/provider/settings/ads") {
    return pathname.startsWith("/provider/settings/ads");
  }
  if (href === "/provider/express-booking") {
    return pathname.startsWith("/provider/express-booking");
  }
  if (href === "/provider/front-desk") {
    return pathname.startsWith("/provider/front-desk");
  }
  if (href === "/provider/recurring-appointments") {
    return pathname.startsWith("/provider/recurring-appointments");
  }
  if (href === "/help") {
    return pathname === "/help" || (pathname.startsWith("/help/") && !pathname.startsWith("/help/my-tickets"));
  }
  if (href === "/help/my-tickets") {
    return pathname.startsWith("/help/my-tickets");
  }
  return pathname === href || pathname.startsWith(href + "/");
};

export function ProviderSidebar() {
  const { t } = useTranslation();
  const { dir } = useLocale();
  const tooltipSide = dir === "rtl" ? "left" : "right";
  const pathname = usePathname();
  const { isExpanded, setIsExpanded } = useProviderSidebar();
  const { signOut, user: _user, role } = useAuth();
  const { branding } = usePlatformSettings();
  const { hasPermission, isLoading: permissionsLoading, permissions } = usePermissions();
  const yocoEnabled = useFeatureFlag("payment_yoco");
  const paystackTerminalEnabled = useFeatureFlag("payment_paystack_virtual_terminal");
  const paycloudEnabled = useFeatureFlag("payment_paycloud");
  const unifiedPosEnabled = useFeatureFlag(FEATURE_FLAG_KEYS.PROVIDER_UNIFIED_POS);
  const [navCounts, setNavCounts] = React.useState<ProviderNavCounts>(emptyNavCounts);
  
  // Track if user was a provider owner (to handle temporary role loss during tab switches)
  const wasOwnerRef = React.useRef<boolean>(false);
  React.useEffect(() => {
    if (role === 'provider_owner') {
      wasOwnerRef.current = true;
    }
  }, [role]);

  // Get platform colors with fallbacks
  const primaryColor = branding?.primary_color || "#FF0077";
  const secondaryColor = branding?.secondary_color || "#4fd1c5";
  const platformName = branding?.site_name || "Beautonomi";
  /** Brand-tinted shell (replaces neutral charcoal) so the portal reads as platform-colored */
  const portalNavSurfaceStyle = {
    background: `linear-gradient(to bottom, color-mix(in srgb, ${primaryColor} 30%, #171216) 0%, color-mix(in srgb, ${secondaryColor} 22%, #100d10) 100%)`,
  } as const;
  
  // Determine if user is/was a provider (handles temporary role loss)
  const isProvider = role === 'provider_owner' || role === 'provider_staff' || wasOwnerRef.current;

  React.useEffect(() => {
    if (!isProvider) return;

    let cancelled = false;
    const loadCounts = async () => {
      try {
        const response = await fetch("/api/provider/nav-counts", {
          credentials: "include",
          cache: "no-store",
        });
        if (!response.ok) return;
        const payload = await response.json();
        const data = (payload?.data ?? payload) as Partial<ProviderNavCounts>;
        if (cancelled) return;
        setNavCounts({
          pending_bookings: Number(data.pending_bookings ?? 0),
          active_product_orders: Number(data.active_product_orders ?? 0),
          unread_messages: Number(data.unread_messages ?? 0),
          waiting_room: Number(data.waiting_room ?? 0),
          critical_total: Number(data.critical_total ?? 0),
        });
      } catch {
        // Nav badges are alert helpers; never block the sidebar if counts fail.
      }
    };

    void loadCounts();
    const interval = window.setInterval(loadCounts, 30_000);
    const onFocus = () => void loadCounts();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [isProvider]);

  const navCountByHref = React.useMemo<Record<string, number>>(
    () => ({
      "/provider/bookings": navCounts.pending_bookings,
      "/provider/ecommerce/orders": navCounts.active_product_orders,
      "/provider/messaging": navCounts.unread_messages,
      "/provider/waiting-room": navCounts.waiting_room,
    }),
    [navCounts],
  );

  const passesFeatureFlag = React.useCallback(
    (item: NavItemConfig) => {
      if (item.featureFlag === "payment_yoco" && !yocoEnabled) return false;
      if (item.featureFlag === "payment_paystack_virtual_terminal" && !paystackTerminalEnabled) return false;
      if (item.featureFlag === "payment_paycloud" && !paycloudEnabled) return false;
      if (item.featureFlag === FEATURE_FLAG_KEYS.PROVIDER_UNIFIED_POS && !unifiedPosEnabled) return false;
      return true;
    },
    [yocoEnabled, paystackTerminalEnabled, paycloudEnabled, unifiedPosEnabled],
  );

  const passesPermission = React.useCallback(
    (item: NavItemConfig) => {
      if (!item.permission) return true;
      if (permissionsLoading) return true;
      if (!permissions) return true;
      try {
        return hasPermission(item.permission);
      } catch {
        return true;
      }
    },
    [permissionsLoading, permissions, hasPermission],
  );

  // Filter navigation: feature flags apply to all roles; owners bypass permission checks only.
  const filteredNavigationSections = React.useMemo(() => {
    const isOwner = isProvider && (role === "provider_owner" || wasOwnerRef.current);

    const withFilteredItems = navigationSections.map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (!passesFeatureFlag(item)) return false;
        if (isOwner) return true;
        return passesPermission(item);
      }),
    }));

    return withFilteredItems
      .map((section) => {
        if (section.titleKey === "web.provider.sidebar.sections.ecommerce" && section.items.length === 0) {
          return {
            ...section,
            items: [{ icon: Store, labelKey: "web.provider.sidebar.items.ecommerce", href: "/provider/ecommerce/orders", permission: undefined }],
          };
        }
        return section;
      })
      .filter((section) => section.items.length > 0);
  }, [isProvider, role, passesFeatureFlag, passesPermission]);

  const filteredBottomItems = bottomItems;

  const toggleSidebar = () => {
    setIsExpanded(!isExpanded);
  };

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  return (
    <TooltipProvider delayDuration={0}>
      <div
        className={cn(
          "fixed start-0 top-0 z-40 h-screen flex flex-col py-3 hidden md:flex transition-all duration-300 ease-in-out",
          "overflow-x-hidden overflow-y-auto box-border",
          isExpanded ? "w-64" : "w-[72px]"
        )}
        style={portalNavSurfaceStyle}
      >
        {/* Header with Logo and Toggle */}
        <div className={cn(
          "flex items-center mb-4 px-3",
          isExpanded ? "justify-between" : "justify-center"
        )}>
          {isExpanded ? (
            <Link href="/provider/dashboard" className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden bg-white shadow-md ring-1 ring-white/40 shrink-0">
                <PlatformLogo
                  alt={platformName}
                  className="w-6 h-6 object-contain"
                  width={24}
                  height={24}
                />
              </div>
              <span className="text-lg font-bold text-white">{platformName}</span>
            </Link>
          ) : (
            <Link href="/provider/dashboard">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden bg-white shadow-md ring-1 ring-white/40">
                <PlatformLogo
                  alt={platformName}
                  className="w-8 h-8 object-contain"
                  width={32}
                  height={32}
                />
              </div>
            </Link>
          )}
          {isExpanded && (
            <button
              onClick={toggleSidebar}
              className="p-2 rounded-lg text-gray-400 hover:bg-white/10 hover:text-white transition-all"
              aria-label={t("web.provider.sidebar.items.collapseSidebar")}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
        </div>

        <ProviderOrgSwitcher collapsed={!isExpanded} />

        {/* Toggle button when collapsed */}
        {!isExpanded && (
          <button
            onClick={toggleSidebar}
            className="mx-auto mb-4 p-2 rounded-lg text-gray-400 hover:bg-white/10 hover:text-white transition-all"
            aria-label={t("web.provider.sidebar.items.expandSidebar")}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}

        {/* Navigation Sections */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 space-y-6 scrollbar-hide box-border min-w-0">
          {filteredNavigationSections.map((section, _sectionIdx) => (
            <div key={section.titleKey}>
              {/* Section Title */}
              {isExpanded && (
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2 px-3">
                  {t(section.titleKey)}
                </p>
              )}
              
              {/* Section Items */}
              <div className="space-y-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = isActiveRoute(pathname, item.href);
                  const count = navCountByHref[item.href] ?? 0;
                  const countLabel = count > 0 ? formatNavCount(count) : null;
                  const linkContent = (
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 min-h-11 touch-manipulation rounded-xl transition-all relative group",
                        isExpanded ? "px-3 py-2" : "justify-center px-2 py-2",
                        isActive
                          ? "text-white shadow-md"
                          : "text-gray-400 hover:bg-white/10 hover:text-white"
                      )}
                      style={isActive ? {
                        background: `linear-gradient(to right, ${primaryColor}, ${primaryColor}CC)`,
                        boxShadow: `0 10px 15px -3px ${primaryColor}33, 0 4px 6px -2px ${primaryColor}33`,
                      } : undefined}
                    >
                      <Icon className={cn(
                        "w-5 h-5 flex-shrink-0 transition-transform pointer-events-none",
                        isActive && "scale-110"
                      )} />
                      {!isExpanded && countLabel && (
                        <span className="absolute end-1.5 top-1.5 min-w-4 h-4 rounded-full bg-red-500 px-1 text-[9px] font-bold leading-4 text-white ring-2 ring-white/20 pointer-events-none">
                          {countLabel}
                        </span>
                      )}
                      {isExpanded && (
                        <>
                          <span className="text-sm font-medium whitespace-nowrap flex-1 pointer-events-none">
                            {t(item.labelKey)}
                          </span>
                          {countLabel && (
                            <span className="min-w-5 rounded-full bg-red-500 px-1.5 py-0.5 text-center text-[10px] font-bold text-white pointer-events-none">
                              {countLabel}
                            </span>
                          )}
                          {item.badge && (
                            
                            <span 
                              className="px-1.5 py-0.5 text-[9px] font-bold uppercase text-[#1a1f3c] rounded pointer-events-none"
                              style={{
                                backgroundColor: secondaryColor,
                              }}
                            >
                              {t("web.provider.sidebar.items.badgeHot")}
                            </span>
                          )}
                        </>
                      )}
                      {isActive && !isExpanded && (
                        <span className="absolute start-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-white rounded-e-full" />
                      )}
                    </Link>
                  );

                  // Wrap in tooltip when collapsed
                  if (!isExpanded) {
                    return (
                      <Tooltip key={item.href}>
                        <TooltipTrigger asChild>
                          {linkContent}
                        </TooltipTrigger>
                        <TooltipContent side={tooltipSide} className="font-medium">
                          {t(item.labelKey)}
                        </TooltipContent>
                      </Tooltip>
                    );
                  }

                  return <div key={item.href}>{linkContent}</div>;
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom Section */}
        <div className="mt-auto pt-2 border-t border-white/10 px-3 space-y-1 box-border min-w-0 overflow-x-hidden">
          {filteredBottomItems.map((item) => {
            const Icon = item.icon;
            const isActive = isActiveRoute(pathname, item.href);

            const linkContent = (
              <Link
                href={item.href}
                className={cn(
                  "flex items-center gap-3 min-h-11 touch-manipulation rounded-xl transition-all",
                  isExpanded ? "px-3" : "justify-center px-2",
                  isActive
                    ? "bg-white/10 text-white"
                    : "text-gray-400 hover:bg-white/10 hover:text-white"
                )}
              >
                <Icon className="w-5 h-5 flex-shrink-0 pointer-events-none" />
                {isExpanded && (
                  <span className="text-sm font-medium pointer-events-none">{t(item.labelKey)}</span>
                )}
              </Link>
            );

            if (!isExpanded) {
              return (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>
                    {linkContent}
                  </TooltipTrigger>
                  <TooltipContent side={tooltipSide} className="font-medium">
                    {t(item.labelKey)}
                  </TooltipContent>
                </Tooltip>
              );
            }

            return <div key={item.href}>{linkContent}</div>;
          })}

          {/* Logout Button */}
          {isExpanded ? (
            <button
              type="button"
              onClick={handleLogout}
              className={cn(
                "flex items-center gap-3 min-h-11 touch-manipulation w-full rounded-xl px-3",
                "text-gray-400 hover:bg-red-500/10 hover:text-red-400 transition-all"
              )}
            >
              <LogOut className="w-5 h-5 flex-shrink-0 pointer-events-none" />
              <span className="text-sm font-medium pointer-events-none">{t("web.provider.sidebar.items.signOut")}</span>
            </button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handleLogout}
                  className={cn(
                    "flex items-center justify-center min-h-11 touch-manipulation w-full rounded-xl px-2",
                    "text-gray-400 hover:bg-red-500/10 hover:text-red-400 transition-all"
                  )}
                >
                  <LogOut className="w-5 h-5 pointer-events-none" />
                </button>
              </TooltipTrigger>
              <TooltipContent side={tooltipSide} className="font-medium">
                {t("web.provider.sidebar.items.signOut")}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
