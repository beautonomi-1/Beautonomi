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
} from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import PlatformLogo from "@/components/platform/PlatformLogo";
import { useAuth } from "@/providers/AuthProvider";
import { usePlatformSettings } from "@/providers/PlatformSettingsProvider";
import { usePermissions } from "@/hooks/usePermissions";
import type { StaffPermissions } from "@/lib/auth/permissions";

interface NavItem {
  icon: React.ElementType;
  label: string;
  href: string;
  badge?: string;
  permission?: keyof StaffPermissions;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const quickActions: NavItem[] = [
  { icon: Calendar, label: "New Appointment", href: "/provider/calendar" },
  { icon: UsersRound, label: "New Client", href: "/provider/clients" },
  { icon: Wallet, label: "New Sale", href: "/provider/sales" },
  { icon: Clock, label: "Add to Waitlist", href: "/provider/waitlist" },
];

const navigationSections: NavSection[] = [
  {
    title: "Main",
    items: [
      { icon: LayoutDashboard, label: "Dashboard", href: "/provider/dashboard" },
      { icon: Calendar, label: "Calendar", href: "/provider/calendar", badge: "Hot", permission: "view_calendar" },
      { icon: CalendarCheck, label: "Appointments", href: "/provider/appointments", permission: "view_calendar" },
    ],
  },
  {
    title: "Operations",
    items: [
      { icon: Clock, label: "Waitlist", href: "/provider/waitlist", permission: "view_calendar" },
      { icon: Repeat, label: "Recurring", href: "/provider/recurring-appointments", permission: "view_calendar" },
      { icon: UserCheck, label: "Waiting Room", href: "/provider/waiting-room", permission: "view_calendar" },
      { icon: Monitor, label: "Front desk", href: "/provider/front-desk", permission: "view_calendar" },
      { icon: UsersRound, label: "Clients", href: "/provider/clients", permission: "view_clients" },
    ],
  },
  {
    title: "Schedule",
    items: [
      { icon: CalendarClock, label: "Schedule", href: "/provider/schedule", permission: "view_calendar" },
      { icon: CalendarOff, label: "Time Blocks", href: "/provider/time-blocks", permission: "view_calendar" },
      { icon: CalendarOff, label: "Days Off", href: "/provider/team/days-off", permission: "view_team" },
    ],
  },
  {
    title: "Business",
    items: [
      { icon: Tag, label: "Sales", href: "/provider/sales", permission: "view_sales" },
      { icon: Wallet, label: "Finance", href: "/provider/finance", permission: "view_sales" },
      { icon: Coins, label: "Payouts", href: "/provider/payouts", permission: "view_sales" },
      { icon: BarChart3, label: "Analytics", href: "/provider/analytics", permission: "view_reports" },
      { icon: BarChart3, label: "Reports", href: "/provider/reports", permission: "view_reports" },
      { icon: Trophy, label: "Rewards & Badges", href: "/provider/gamification" },
      { icon: Grid3x3, label: "Catalogue", href: "/provider/catalogue", permission: "view_products" },
      { icon: Sparkles, label: "Packages", href: "/provider/packages", permission: "view_services" },
    ],
  },
  {
    title: "E-Commerce",
    items: [
      { icon: Store, label: "E-Commerce", href: "/provider/ecommerce", permission: "view_products" },
      { icon: Package, label: "Orders", href: "/provider/orders", permission: "view_sales" },
      { icon: ShoppingBag, label: "Walk-in Sale", href: "/provider/ecommerce/walk-in", permission: "view_sales" },
      { icon: Truck, label: "Shipping", href: "/provider/ecommerce/shipping", permission: "edit_settings" },
    ],
  },
  {
    title: "Resources & Forms",
    items: [
      { icon: Layers, label: "Resources", href: "/provider/resources", permission: "edit_settings" },
      { icon: FileText, label: "Forms", href: "/provider/forms", permission: "edit_settings" },
    ],
  },
  {
    title: "Team & Marketing",
    items: [
      { icon: Sparkles, label: "Explore Content", href: "/provider/explore", permission: "create_explore_posts" },
      { icon: Users, label: "Team", href: "/provider/team", permission: "view_team" },
      { icon: PiggyBank, label: "Payroll", href: "/provider/team/payroll", permission: "view_team" },
      { icon: DollarSign, label: "My Earnings", href: "/provider/team/my-earnings", permission: "view_team" },
      { icon: Star, label: "Reviews", href: "/provider/reviews", permission: "view_reviews" },
      { icon: MessageSquare, label: "Messages", href: "/provider/messaging", permission: "view_messages" },
      { icon: Megaphone, label: "Marketing", href: "/provider/marketing/automations", permission: "edit_settings" },
      { icon: Link2, label: "Booking links", href: "/provider/express-booking", permission: "edit_settings" },
    ],
  },
];

const bottomItems: NavItem[] = [
  { icon: HelpCircle, label: "Help & Support", href: "/help" },
  { icon: TicketCheck, label: "My Tickets", href: "/help/submit-ticket" },
  { icon: Settings, label: "Settings", href: "/provider/settings" },
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
  "/provider/orders": "/provider/orders",
  "/provider/resources": "/provider/resources",
  "/provider/forms": "/provider/forms",
  "/provider/schedule": "/provider/schedule",
  "/provider/time-blocks": "/provider/time-blocks",
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
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { signOut } = useAuth();
  const { branding } = usePlatformSettings();
  const { hasPermission, isLoading: permissionsLoading } = usePermissions();
  
  // Get platform colors with fallbacks
  const primaryColor = branding?.primary_color || "#FF0077";
  const secondaryColor = branding?.secondary_color || "#4fd1c5";
  const platformName = branding?.site_name || "Beautonomi";
  const portalNavSurfaceStyle = {
    background: `linear-gradient(to bottom, color-mix(in srgb, ${primaryColor} 30%, #171216) 0%, color-mix(in srgb, ${secondaryColor} 22%, #100d10) 100%)`,
  } as const;

  const filteredNavigationSections = useMemo(() =>
    navigationSections.map(section => ({
      ...section,
      items: section.items.filter(item => {
        if (!item.permission) return true;
        if (permissionsLoading) return true;
        return hasPermission(item.permission);
      })
    })).filter(section => section.items.length > 0),
    [permissionsLoading, hasPermission]
  );

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
          aria-label="Open navigation menu"
        >
          <Menu className="w-6 h-6 pointer-events-none" aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-80 sm:w-96 text-white p-0 overflow-hidden border-r border-white/10"
        style={portalNavSurfaceStyle}
      >
        <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
        <SheetDescription className="sr-only">
          Main navigation menu for provider dashboard
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
              Quick Actions
            </p>
            <div className="grid grid-cols-2 gap-2">
              {quickActions.map((action) => {
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
                    <span className="text-xs font-medium">{action.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Navigation Sections */}
          <nav className="flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain px-3 py-3 space-y-5 scrollbar-hide [-webkit-overflow-scrolling:touch]">
            {filteredNavigationSections.map((section) => (
              <div key={section.title}>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 px-3">
                  {section.title}
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
                          {item.label}
                        </span>
                        {item.badge && (
                          <span 
                            className="px-1.5 py-0.5 text-[9px] font-bold uppercase text-[#1a1f3c] rounded"
                            style={{
                              backgroundColor: secondaryColor,
                            }}
                          >
                            {item.badge}
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
                  <span className="text-sm font-medium">{item.label}</span>
                </Link>
              );
            })}

            <button
              onClick={handleLogout}
              className="flex items-center gap-3 min-h-[44px] w-full rounded-xl px-3 text-gray-400 hover:bg-red-500/10 hover:text-red-400 transition-all touch-manipulation"
            >
              <LogOut className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm font-medium">Sign Out</span>
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
