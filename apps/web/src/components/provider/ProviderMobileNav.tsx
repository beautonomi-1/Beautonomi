"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Calendar,
  Tag,
  Grid3x3,
  Megaphone,
  Users,
  Settings,
  Menu,
  X,
  LogOut,
  UsersRound,
  Star,
  MessageSquare,
  Wallet,
  CalendarCheck,
  Clock,
  UserCheck,
  BarChart3,
  Sparkles,
  Trophy,
  Plus,
  CalendarClock,
  CalendarOff,
  Store,
  Package,
  Truck,
  ShoppingBag,
  FileText,
  Layers,
  HelpCircle,
  TicketCheck,
  Coins,
  DollarSign,
  Repeat,
  Link2,
  Monitor,
  PiggyBank,
  CreditCard,
  CalendarRange,
  Undo2,
  QrCode,
} from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import PlatformLogo from "@/components/platform/PlatformLogo";
import { useAuth } from "@/providers/AuthProvider";
import { usePlatformSettings } from "@/providers/PlatformSettingsProvider";
import { usePermissions } from "@/hooks/usePermissions";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { FEATURE_FLAG_KEYS } from "@/lib/server/feature-flag-keys";
import type { StaffPermissions } from "@/lib/auth/permissions";

import { useTranslation } from "@beautonomi/i18n";
interface NavItem {
  icon: React.ElementType;
  labelKey: string;
  href: string;
  badge?: boolean;
  permission?: keyof StaffPermissions;
  featureFlag?: "payment_yoco" | "payment_paystack_virtual_terminal" | typeof FEATURE_FLAG_KEYS.PROVIDER_UNIFIED_POS;
}

interface NavSection {
  titleKey: string;
  items: NavItem[];
}

const quickActions: NavItem[] = [
  { icon: Calendar, labelKey: "web.provider.sidebar.items.newAppointment", href: "/provider/calendar" },
  { icon: UsersRound, labelKey: "web.provider.sidebar.items.newClient", href: "/provider/clients" },
  { icon: Wallet, labelKey: "web.provider.sidebar.items.newSale", href: "/provider/sales", featureFlag: FEATURE_FLAG_KEYS.PROVIDER_UNIFIED_POS },
  { icon: Clock, labelKey: "web.provider.sidebar.items.addToWaitlist", href: "/provider/waitlist" },
];

const navigationSections: NavSection[] = [
  {
    titleKey: "web.provider.sidebar.sections.main",
    items: [
      { icon: LayoutDashboard, labelKey: "web.provider.sidebar.items.dashboard", href: "/provider/dashboard" },
      { icon: Calendar, labelKey: "web.provider.sidebar.items.calendar", href: "/provider/calendar", badge: true, permission: "view_calendar" },
      { icon: CalendarCheck, labelKey: "web.provider.sidebar.items.bookings", href: "/provider/bookings", permission: "view_calendar" },
    ],
  },
  {
    titleKey: "web.provider.sidebar.sections.operations",
    items: [
      { icon: Clock, labelKey: "web.provider.sidebar.items.waitlist", href: "/provider/waitlist", permission: "view_calendar" },
      { icon: Repeat, labelKey: "web.provider.sidebar.items.recurring", href: "/provider/recurring-appointments", permission: "view_calendar" },
      { icon: UsersRound, labelKey: "web.provider.sidebar.items.groupBookings", href: "/provider/group-bookings", permission: "view_calendar" },
      { icon: UserCheck, labelKey: "web.provider.sidebar.items.waitingRoom", href: "/provider/waiting-room", permission: "view_calendar" },
      { icon: Monitor, labelKey: "web.provider.sidebar.items.frontDesk", href: "/provider/front-desk", permission: "view_calendar" },
      { icon: UsersRound, labelKey: "web.provider.sidebar.items.clients", href: "/provider/clients", permission: "view_clients" },
    ],
  },
  {
    titleKey: "web.provider.sidebar.sections.schedule",
    items: [
      { icon: CalendarClock, labelKey: "web.provider.sidebar.items.schedule", href: "/provider/schedule", permission: "view_calendar" },
      { icon: Clock, labelKey: "web.provider.sidebar.items.operatingHours", href: "/provider/settings/operating-hours", permission: "edit_settings" },
      { icon: CalendarRange, labelKey: "web.provider.sidebar.items.shifts", href: "/provider/team/shifts", permission: "view_team" },
      { icon: CalendarOff, labelKey: "web.provider.sidebar.items.timeBlocks", href: "/provider/time-blocks", permission: "view_calendar" },
      { icon: CalendarOff, labelKey: "web.provider.sidebar.items.daysOff", href: "/provider/team/days-off", permission: "view_team" },
      { icon: CalendarOff, labelKey: "web.provider.sidebar.items.closedPeriods", href: "/provider/settings/appointment-activity/closed-periods", permission: "edit_settings" },
    ],
  },
  {
    titleKey: "web.provider.sidebar.sections.resourcesForms",
    items: [
      { icon: Layers, labelKey: "web.provider.sidebar.items.resourcesForms", href: "/provider/resources-forms", permission: "edit_settings" },
      { icon: Package, labelKey: "web.provider.sidebar.items.resources", href: "/provider/resources", permission: "edit_settings" },
      { icon: FileText, labelKey: "web.provider.sidebar.items.forms", href: "/provider/forms", permission: "edit_settings" },
    ],
  },
  {
    titleKey: "web.provider.sidebar.sections.orders",
    items: [
      { icon: ShoppingBag, labelKey: "web.provider.sidebar.items.orders", href: "/provider/ecommerce/orders", permission: "view_sales" },
      { icon: Undo2, labelKey: "web.provider.sidebar.items.returns", href: "/provider/ecommerce/returns", permission: "view_sales" },
    ],
  },
  {
    titleKey: "web.provider.sidebar.sections.business",
    items: [
      { icon: Tag, labelKey: "web.provider.sidebar.items.sales", href: "/provider/sales", permission: "view_sales", featureFlag: FEATURE_FLAG_KEYS.PROVIDER_UNIFIED_POS },
      { icon: Wallet, labelKey: "web.provider.sidebar.items.finance", href: "/provider/finance", permission: "view_sales" },
      { icon: PiggyBank, labelKey: "web.provider.sidebar.items.bankAccounts", href: "/provider/settings/payout-accounts", permission: "view_sales" },
      { icon: CreditCard, labelKey: "web.provider.sidebar.items.paymentMethods", href: "/provider/settings/payments", permission: "edit_settings" },
      { icon: CreditCard, labelKey: "web.provider.sidebar.items.yoco", href: "/provider/settings/sales/yoco-integration", permission: "edit_settings", featureFlag: "payment_yoco" },
      { icon: QrCode, labelKey: "web.provider.sidebar.items.paystackTerminal", href: "/provider/settings/sales/paystack-terminal", permission: "edit_settings", featureFlag: "payment_paystack_virtual_terminal" },
      { icon: CreditCard, labelKey: "web.provider.sidebar.items.subscription", href: "/provider/subscription" },
      { icon: BarChart3, labelKey: "web.provider.sidebar.items.analytics", href: "/provider/analytics", permission: "view_reports" },
      { icon: BarChart3, labelKey: "web.provider.sidebar.items.reports", href: "/provider/reports", permission: "view_reports" },
      { icon: Trophy, labelKey: "web.provider.sidebar.items.rewardsBadges", href: "/provider/gamification" },
      { icon: Grid3x3, labelKey: "web.provider.sidebar.items.catalogue", href: "/provider/catalogue", permission: "view_products" },
      { icon: Sparkles, labelKey: "web.provider.sidebar.items.packages", href: "/provider/packages", permission: "view_services" },
      { icon: TicketCheck, labelKey: "web.provider.sidebar.items.memberships", href: "/provider/settings/services/memberships", permission: "view_services" },
    ],
  },
  {
    titleKey: "web.provider.sidebar.sections.ecommerce",
    items: [
      { icon: Store, labelKey: "web.provider.sidebar.items.ecommerce", href: "/provider/ecommerce", permission: "view_products" },
      { icon: Store, labelKey: "web.provider.sidebar.items.products", href: "/provider/ecommerce/products", permission: "view_products" },
      { icon: ShoppingBag, labelKey: "web.provider.sidebar.items.walkInSale", href: "/provider/ecommerce/walk-in", permission: "view_sales" },
      { icon: Truck, labelKey: "web.provider.sidebar.items.shipping", href: "/provider/ecommerce/shipping", permission: "edit_settings" },
    ],
  },
  {
    titleKey: "web.provider.sidebar.sections.teamMarketing",
    items: [
      { icon: Sparkles, labelKey: "web.provider.sidebar.items.exploreContent", href: "/provider/explore", permission: "create_explore_posts" },
      { icon: Users, labelKey: "web.provider.sidebar.items.team", href: "/provider/team", permission: "view_team" },
      { icon: Users, labelKey: "web.provider.sidebar.items.teamMembers", href: "/provider/team/members", permission: "view_team" },
      { icon: PiggyBank, labelKey: "web.provider.sidebar.items.payroll", href: "/provider/team/payroll", permission: "view_team" },
      { icon: DollarSign, labelKey: "web.provider.sidebar.items.myEarnings", href: "/provider/team/my-earnings", permission: "view_team" },
      { icon: Star, labelKey: "web.provider.sidebar.items.reviews", href: "/provider/reviews", permission: "view_reviews" },
      { icon: MessageSquare, labelKey: "web.provider.sidebar.items.messages", href: "/provider/messaging", permission: "view_messages" },
      { icon: Megaphone, labelKey: "web.provider.sidebar.items.marketing", href: "/provider/marketing/automations", permission: "edit_settings" },
      { icon: Megaphone, labelKey: "web.provider.sidebar.items.paidAds", href: "/provider/settings/ads", permission: "edit_settings" },
      { icon: Link2, labelKey: "web.provider.sidebar.items.bookingLinks", href: "/provider/express-booking", permission: "edit_settings" },
    ],
  },
];

const bottomItems: NavItem[] = [
  { icon: HelpCircle, labelKey: "web.provider.sidebar.items.helpSupport", href: "/help" },
  { icon: TicketCheck, labelKey: "web.provider.sidebar.items.myTickets", href: "/help/my-tickets" },
  { icon: Settings, labelKey: "web.provider.sidebar.items.settings", href: "/provider/settings" },
];

const routePrefixMap: Record<string, string> = {
  "/provider/catalogue": "/provider/catalogue",
  "/provider/explore": "/provider/explore",
  "/provider/marketing/automations": "/provider/marketing",
  "/provider/team": "/provider/team",
  "/provider/settings": "/provider/settings",
  "/provider/reports": "/provider/reports",
  "/provider/gamification": "/provider/gamification",
  "/provider/ecommerce": "/provider/ecommerce",
  "/provider/ecommerce/orders": "/provider/ecommerce/orders",
  "/provider/ecommerce/returns": "/provider/ecommerce/returns",
  "/provider/ecommerce/products": "/provider/ecommerce/products",
  "/provider/orders": "/provider/orders",
  "/provider/resources": "/provider/resources",
  "/provider/resources-forms": "/provider/resources-forms",
  "/provider/forms": "/provider/forms",
  "/provider/schedule": "/provider/schedule",
  "/provider/time-blocks": "/provider/time-blocks",
  "/provider/group-bookings": "/provider/group-bookings",
  "/provider/settings/operating-hours": "/provider/settings/operating-hours",
  "/provider/settings/appointment-activity/closed-periods": "/provider/settings/appointment-activity/closed-periods",
  "/provider/settings/payout-accounts": "/provider/settings/payout-accounts",
  "/provider/settings/sales/yoco-integration": "/provider/settings/sales/yoco-integration",
  "/provider/settings/sales/paystack-terminal": "/provider/settings/sales/paystack-terminal",
  "/provider/settings/payments": "/provider/settings/payments",
  "/provider/settings/services/memberships": "/provider/settings/services/memberships",
  "/provider/settings/ads": "/provider/settings/ads",
  "/provider/subscription": "/provider/subscription",
  "/provider/payouts": "/provider/payouts",
  "/provider/recurring-appointments": "/provider/recurring-appointments",
  "/provider/express-booking": "/provider/express-booking",
  "/provider/front-desk": "/provider/front-desk",
  "/help": "/help",
};

const isActiveRoute = (pathname: string, href: string): boolean => {
  const prefix = routePrefixMap[href];
  if (prefix) return pathname.startsWith(prefix);
  return pathname === href || pathname.startsWith(href + "/");
};

export function ProviderMobileNav() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { signOut } = useAuth();
  const { branding } = usePlatformSettings();
  const { hasPermission, isLoading: permissionsLoading } = usePermissions();
  const yocoEnabled = useFeatureFlag("payment_yoco");
  const paystackTerminalEnabled = useFeatureFlag("payment_paystack_virtual_terminal");
  const unifiedPosEnabled = useFeatureFlag(FEATURE_FLAG_KEYS.PROVIDER_UNIFIED_POS);

  const passesNavFeatureFlag = (item: NavItem) => {
    if (item.featureFlag === "payment_yoco" && !yocoEnabled) return false;
    if (item.featureFlag === "payment_paystack_virtual_terminal" && !paystackTerminalEnabled) return false;
    if (item.featureFlag === FEATURE_FLAG_KEYS.PROVIDER_UNIFIED_POS && !unifiedPosEnabled) return false;
    return true;
  };

  const filteredQuickActions = useMemo(
    () => quickActions.filter((item) => passesNavFeatureFlag(item)),
    [yocoEnabled, paystackTerminalEnabled, unifiedPosEnabled],
  );

  const filteredNavigationSections = useMemo(
    () =>
      navigationSections
        .map((section) => ({
          ...section,
          items: section.items.filter((item) => {
            if (!passesNavFeatureFlag(item)) return false;
            if (!item.permission) return true;
            if (permissionsLoading) return true;
            return hasPermission(item.permission);
          }),
        }))
        .filter((section) => section.items.length > 0),
    [permissionsLoading, hasPermission, yocoEnabled, paystackTerminalEnabled, unifiedPosEnabled],
  );

  const primaryColor = branding?.primary_color || "#FF0077";
  const secondaryColor = branding?.secondary_color || "#4fd1c5";
  const platformName = branding?.site_name || t("web.seo.siteName");
  const portalNavSurfaceStyle = {
    background: `linear-gradient(to bottom, color-mix(in srgb, ${primaryColor} 30%, #171216) 0%, color-mix(in srgb, ${secondaryColor} 22%, #100d10) 100%)`,
  } as const;

  const handleLogout = async () => {
    try {
      await signOut();
      setOpen(false);
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden min-h-[44px] min-w-[44px] touch-manipulation shrink-0"
          aria-label={t("web.provider.sidebar.openMenuAria")}
        >
          <Menu className="w-6 h-6 pointer-events-none" aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-80 sm:w-96 text-white p-0 overflow-hidden border-e border-white/10"
        style={portalNavSurfaceStyle}
      >
        <SheetTitle className="sr-only">{t("web.provider.sidebar.navTitle")}</SheetTitle>
        <SheetDescription className="sr-only">
          {t("web.provider.sidebar.navDescription")}
        </SheetDescription>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="h-16 flex items-center justify-between px-4 border-b border-white/10 flex-shrink-0">
            <Link href="/provider/dashboard" onClick={() => setOpen(false)} className="flex items-center gap-2 min-w-0">
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
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)} className="text-gray-400 hover:text-white hover:bg-white/10">
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Quick Actions */}
          <div className="px-3 pt-4 pb-2">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2 px-3">
{t("web.provider.sidebar.quickActions")}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {filteredQuickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <Link
                    key={action.href}
                    href={action.href}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2 min-h-[44px] px-3 rounded-xl text-white/90 hover:bg-white/10 transition-all touch-manipulation"
                    style={{
                      background: `linear-gradient(135deg, ${primaryColor}33, ${secondaryColor}33)`,
                      border: `1px solid ${primaryColor}44`,
                    }}
                  >
                    <Plus className="w-4 h-4 flex-shrink-0" style={{ color: secondaryColor }} />
                    <span className="text-xs font-medium">{t(action.labelKey)}</span>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Navigation Sections */}
          <nav className="flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain px-3 py-3 space-y-5 scrollbar-hide [-webkit-overflow-scrolling:touch]">
            {filteredNavigationSections.map((section) => (
              <div key={section.titleKey}>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 px-3">
                  {t(section.titleKey)}
                </p>
                
                <div className="space-y-0.5">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = isActiveRoute(pathname, item.href);

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setOpen(false)}
                        aria-current={isActive ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-3 min-h-[44px] px-3 rounded-xl transition-all relative touch-manipulation",
                          isActive
                            ? "text-white shadow-lg"
                            : "text-gray-400 hover:bg-white/10 hover:text-white active:bg-white/15"
                        )}
                        style={isActive ? {
                          background: `linear-gradient(to right, ${primaryColor}, ${primaryColor}CC)`,
                          boxShadow: `0 10px 15px -3px ${primaryColor}33, 0 4px 6px -2px ${primaryColor}33`,
                        } : undefined}
                      >
                        <Icon className={cn(
                          "w-5 h-5 flex-shrink-0 transition-transform",
                          isActive && "scale-110"
                        )} />
                        <span className="text-sm font-medium whitespace-nowrap flex-1">
                          {t(item.labelKey)}
                        </span>
                        {item.badge && (
                          <span 
                            className="px-1.5 py-0.5 text-[9px] font-bold uppercase text-[#1a1f3c] rounded"
                            style={{
                              backgroundColor: secondaryColor,
                            }}
                          >
                            {t("web.provider.sidebar.items.badgeHot")}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          {/* Bottom Section */}
          <div className="mt-auto pt-2 border-t border-white/10 px-3 space-y-0.5 flex-shrink-0 pb-safe">
            {bottomItems.map((item) => {
              const Icon = item.icon;
              const isActive = isActiveRoute(pathname, item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 min-h-[44px] px-3 rounded-xl transition-all touch-manipulation",
                    isActive
                      ? "bg-white/10 text-white"
                      : "text-gray-400 hover:bg-white/10 hover:text-white active:bg-white/15"
                  )}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  <span className="text-sm font-medium">{t(item.labelKey)}</span>
                </Link>
              );
            })}

            <button
              onClick={handleLogout}
              className="flex items-center gap-3 min-h-[44px] w-full rounded-xl px-3 text-gray-400 hover:bg-red-500/10 hover:text-red-400 transition-all touch-manipulation"
            >
              <LogOut className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm font-medium">{t("web.provider.sidebar.items.signOut")}</span>
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
