"use client";

import React from "react";
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
  Coins,
  PiggyBank,
  CreditCard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useProviderSidebar } from "@/contexts/ProviderSidebarContext";
import { useAuth } from "@/providers/AuthProvider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { usePlatformSettings } from "@/providers/PlatformSettingsProvider";
import PlatformLogo from "@/components/platform/PlatformLogo";
import { usePermissions } from "@/hooks/usePermissions";
import type { StaffPermissions } from "@/lib/auth/permissions";

// Navigation sections with permission requirements
const navigationSections = [
  {
    title: "Main",
    items: [
      { icon: LayoutDashboard, label: "Dashboard", href: "/provider/dashboard", permission: undefined }, // Always accessible
      { icon: Calendar, label: "Calendar", href: "/provider/calendar", badge: "Hot", permission: "view_calendar" as keyof StaffPermissions },
      { icon: CalendarCheck, label: "Bookings", href: "/provider/bookings", permission: "view_calendar" as keyof StaffPermissions },
    ],
  },
  {
    title: "Operations",
    items: [
      { icon: Clock, label: "Waitlist", href: "/provider/waitlist", permission: "view_calendar" as keyof StaffPermissions },
      { icon: Repeat, label: "Recurring", href: "/provider/recurring-appointments", permission: "view_calendar" as keyof StaffPermissions },
      { icon: UsersRound, label: "Group Bookings", href: "/provider/group-bookings", permission: "view_calendar" as keyof StaffPermissions },
      { icon: Monitor, label: "Front desk", href: "/provider/front-desk", permission: "view_calendar" as keyof StaffPermissions },
      { icon: UserCheck, label: "Waiting Room", href: "/provider/waiting-room", permission: "view_calendar" as keyof StaffPermissions },
      { icon: UsersRound, label: "Clients", href: "/provider/clients", permission: "view_clients" as keyof StaffPermissions },
    ],
  },
  {
    title: "Schedule",
    items: [
      { icon: Calendar, label: "Schedule", href: "/provider/schedule", permission: "view_calendar" as keyof StaffPermissions },
      { icon: Clock, label: "Operating Hours", href: "/provider/settings/operating-hours", permission: "edit_settings" as keyof StaffPermissions },
      { icon: CalendarRange, label: "Shifts", href: "/provider/team/shifts", permission: "view_team" as keyof StaffPermissions },
      { icon: CalendarRange, label: "Time Blocks", href: "/provider/time-blocks", permission: "view_calendar" as keyof StaffPermissions },
      { icon: CalendarOff, label: "Days Off", href: "/provider/team/days-off", permission: "view_team" as keyof StaffPermissions },
      { icon: CalendarOff, label: "Closed Periods", href: "/provider/settings/appointment-activity/closed-periods", permission: "edit_settings" as keyof StaffPermissions },
    ],
  },
  {
    title: "Resources & Forms",
    items: [
      { icon: Grid3x3, label: "Resources & Forms", href: "/provider/resources-forms", permission: "edit_settings" as keyof StaffPermissions },
      { icon: Package, label: "Resources", href: "/provider/resources", permission: "edit_settings" as keyof StaffPermissions },
      { icon: FileEdit, label: "Forms", href: "/provider/forms", permission: "edit_settings" as keyof StaffPermissions },
    ],
  },
  {
    title: "Orders",
    items: [
      { icon: ShoppingBag, label: "Orders", href: "/provider/ecommerce/orders", permission: "view_sales" as keyof StaffPermissions },
      { icon: Undo2, label: "Returns", href: "/provider/ecommerce/returns", permission: "view_sales" as keyof StaffPermissions },
    ],
  },
  {
    title: "E-Commerce",
    items: [
      { icon: Store, label: "E-Commerce", href: "/provider/ecommerce", permission: "view_products" as keyof StaffPermissions },
      { icon: Store, label: "Products", href: "/provider/ecommerce/products", permission: "view_products" as keyof StaffPermissions },
      { icon: Truck, label: "Shipping & Collection", href: "/provider/ecommerce/shipping", permission: "edit_settings" as keyof StaffPermissions },
    ],
  },
  {
    title: "Business",
    items: [
      { icon: Tag, label: "Sales", href: "/provider/sales", permission: "view_sales" as keyof StaffPermissions },
      { icon: Wallet, label: "Finance", href: "/provider/finance", permission: "view_sales" as keyof StaffPermissions },
      // §Provider-launch (audit 2026-04): the /provider/payments list page
      // already exists (transactions tied to bookings/orders), but had no
      // sidebar entry — so providers had no way to reach it except by typing
      // the URL. Group it with Finance/Payouts so the transaction history is
      // discoverable alongside other money surfaces.
      { icon: CreditCard, label: "Payments", href: "/provider/payments", permission: "view_sales" as keyof StaffPermissions },
      { icon: Coins, label: "Payouts", href: "/provider/payouts", permission: "view_sales" as keyof StaffPermissions },
      { icon: BarChart3, label: "Analytics", href: "/provider/analytics", permission: "view_reports" as keyof StaffPermissions },
      { icon: BarChart3, label: "Reports", href: "/provider/reports", permission: "view_reports" as keyof StaffPermissions },
      { icon: Trophy, label: "Rewards & Badges", href: "/provider/gamification", permission: undefined },
      { icon: Grid3x3, label: "Catalogue", href: "/provider/catalogue", permission: "view_products" as keyof StaffPermissions },
      { icon: Sparkles, label: "Packages", href: "/provider/packages", permission: "view_services" as keyof StaffPermissions },
    ],
  },
  {
    title: "Team & Marketing",
    items: [
      { icon: Sparkles, label: "Explore Content", href: "/provider/explore", permission: "create_explore_posts" as keyof StaffPermissions },
      { icon: Users, label: "Team", href: "/provider/team", permission: "view_team" as keyof StaffPermissions },
      { icon: Users, label: "Team members", href: "/provider/team/members", permission: "view_team" as keyof StaffPermissions },
      { icon: PiggyBank, label: "Payroll", href: "/provider/team/payroll", permission: "view_team" as keyof StaffPermissions },
      { icon: DollarSign, label: "My Earnings", href: "/provider/team/my-earnings", permission: "view_team" as keyof StaffPermissions },
      { icon: Star, label: "Reviews", href: "/provider/reviews", permission: "view_reviews" as keyof StaffPermissions },
      { icon: MessageSquare, label: "Messages", href: "/provider/messaging", permission: "view_messages" as keyof StaffPermissions },
      { icon: Megaphone, label: "Marketing", href: "/provider/marketing/automations", permission: "edit_settings" as keyof StaffPermissions },
      { icon: Link2, label: "Booking links", href: "/provider/express-booking", permission: "edit_settings" as keyof StaffPermissions },
    ],
  },
];

const bottomItems = [
  { icon: HelpCircle, label: "Help & Support", href: "/help" },
  { icon: Ticket, label: "My tickets", href: "/help/my-tickets" },
  { icon: Settings, label: "Settings", href: "/provider/settings" },
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
  if (href === "/provider/payouts") {
    return pathname.startsWith("/provider/payouts");
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
  const pathname = usePathname();
  const { isExpanded, setIsExpanded } = useProviderSidebar();
  const { signOut, user: _user, role } = useAuth();
  const { branding } = usePlatformSettings();
  const { hasPermission, isLoading: permissionsLoading, permissions } = usePermissions();
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

  // Filter navigation sections based on permissions
  // CRITICAL FIX: For provider owners, ALWAYS show all menu items
  // This prevents menu from disappearing during tab switches or temporary permission issues
  // Provider owners should have access to everything anyway
  const filteredNavigationSections = React.useMemo(() => {
    // If user is/was a provider owner, show ALL items (no filtering)
    if (isProvider && (role === 'provider_owner' || wasOwnerRef.current)) {
      return navigationSections;
    }
    
    // For staff members, apply permission filtering
    const withFilteredItems = navigationSections.map(section => ({
      ...section,
      items: section.items.filter(item => {
        // If no permission required, always show
        if (!item.permission) return true;
        
        // If permissions are loading, show all items
        if (permissionsLoading) return true;
        
        // If we don't have permissions, show all items (might be temporary)
        if (!permissions) return true;
        
        // Check permission
        try {
          return hasPermission(item.permission);
        } catch {
          // Fail open - show item if check fails
          return true;
        }
      })
    }));
    // Always show E-Commerce section (alignment with provider app): if all items were filtered out, show one entry point
    return withFilteredItems.map(section => {
      if (section.title === "E-Commerce" && section.items.length === 0) {
        return { ...section, items: [{ icon: Store, label: "E-Commerce", href: "/provider/ecommerce/orders", permission: undefined }] };
      }
      return section;
    }).filter(section => section.items.length > 0);
  }, [isProvider, role, permissionsLoading, permissions, hasPermission]);

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
          "fixed left-0 top-0 z-40 h-screen flex flex-col py-3 hidden md:flex transition-all duration-300 ease-in-out",
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
              aria-label="Collapse sidebar"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Toggle button when collapsed */}
        {!isExpanded && (
          <button
            onClick={toggleSidebar}
            className="mx-auto mb-4 p-2 rounded-lg text-gray-400 hover:bg-white/10 hover:text-white transition-all"
            aria-label="Expand sidebar"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}

        {/* Navigation Sections */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 space-y-6 scrollbar-hide box-border min-w-0">
          {filteredNavigationSections.map((section, _sectionIdx) => (
            <div key={section.title}>
              {/* Section Title */}
              {isExpanded && (
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2 px-3">
                  {section.title}
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
                      prefetch={true}
                      className={cn(
                        "flex items-center gap-3 min-h-11 touch-manipulation rounded-xl transition-all relative group",
                        isExpanded ? "px-3" : "justify-center px-2",
                        isActive
                          ? "text-white shadow-lg"
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
                        <span className="absolute right-1.5 top-1.5 min-w-4 h-4 rounded-full bg-red-500 px-1 text-[9px] font-bold leading-4 text-white ring-2 ring-white/20 pointer-events-none">
                          {countLabel}
                        </span>
                      )}
                      {isExpanded && (
                        <>
                          <span className="text-sm font-medium whitespace-nowrap flex-1 pointer-events-none">
                            {item.label}
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
                              {item.badge}
                            </span>
                          )}
                        </>
                      )}
                      {isActive && !isExpanded && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-white rounded-r-full" />
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
                        <TooltipContent side="right" className="font-medium">
                          {item.label}
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
                prefetch={true}
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
                  <span className="text-sm font-medium pointer-events-none">{item.label}</span>
                )}
              </Link>
            );

            if (!isExpanded) {
              return (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>
                    {linkContent}
                  </TooltipTrigger>
                  <TooltipContent side="right" className="font-medium">
                    {item.label}
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
              <span className="text-sm font-medium pointer-events-none">Sign Out</span>
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
              <TooltipContent side="right" className="font-medium">
                Sign Out
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
