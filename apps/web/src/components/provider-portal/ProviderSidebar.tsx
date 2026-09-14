"use client";

import { useTranslation } from "@beautonomi/i18n";

/**
 * @deprecated Use `@/components/provider/ProviderSidebar` from the main provider shell instead.
 * This alternate layout is not mounted by `ProviderShell`; kept only for reference or legacy experiments.
 */

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Calendar,
  Tag,
  Smile,
  Grid3x3,
  Megaphone,
  Users,
  Settings,
  LogOut,
  ListChecks,
  Repeat,
  Package,
  Link as LinkIcon,
  Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useProviderPortal } from "@/providers/provider-portal/ProviderPortalProvider";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ProviderRewardsTeaser } from "./ProviderRewardsTeaser";

const menuItems = [
  { icon: LayoutDashboard, labelKey: "web.provider.sidebar.items.dashboard", href: "/provider/dashboard" },
  { icon: Calendar, labelKey: "web.provider.sidebar.items.calendar", href: "/provider/calendar" },
  { icon: ListChecks, labelKey: "web.provider.sidebar.items.waitlist", href: "/provider/waitlist" },
  { icon: Repeat, labelKey: "web.provider.sidebar.items.recurring", href: "/provider/recurring-appointments" },
  { icon: Tag, labelKey: "web.provider.sidebar.items.sales", href: "/provider/sales" },
  { icon: Smile, labelKey: "web.provider.sidebar.items.clients", href: "/provider/clients" },
  { icon: Grid3x3, labelKey: "web.provider.sidebar.items.catalogue", href: "/provider/catalogue/products" },
  { icon: Package, labelKey: "web.provider.sidebar.items.resources", href: "/provider/resources" },
  { icon: Megaphone, labelKey: "web.provider.sidebar.items.marketing", href: "/provider/marketing/automations" },
  { icon: LinkIcon, labelKey: "web.provider.sidebar.items.bookingLinks", href: "/provider/express-booking" },
  { icon: Users, labelKey: "web.provider.sidebar.items.team", href: "/provider/team/members" },
  { icon: Trophy, labelKey: "web.provider.sidebar.items.rewardsBadges", href: "/provider/gamification" },
  { icon: Settings, labelKey: "web.provider.sidebar.items.settings", href: "/provider/settings" },
];

// Match routes including sub-routes
const isActiveRoute = (pathname: string, href: string) => {
  if (href === "/provider/catalogue/products") {
    return pathname.startsWith("/provider/catalogue");
  }
  if (href === "/provider/marketing/automations") {
    return pathname.startsWith("/provider/marketing");
  }
  if (href === "/provider/team/members") {
    return pathname.startsWith("/provider/team");
  }
  if (href === "/provider/settings") {
    return pathname.startsWith("/provider/settings");
  }
  if (href === "/provider/waitlist") {
    return pathname.startsWith("/provider/waitlist");
  }
  if (href === "/provider/recurring-appointments") {
    return pathname.startsWith("/provider/recurring-appointments");
  }
  if (href === "/provider/resources") {
    return pathname.startsWith("/provider/resources");
  }
  if (href === "/provider/express-booking") {
    return pathname.startsWith("/provider/express-booking");
  }
  if (href === "/provider/gamification") {
    return pathname.startsWith("/provider/gamification");
  }
  return pathname === href || pathname.startsWith(href + "/");
};

export function ProviderSidebar() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const { sidebarCollapsed, setSidebarCollapsed: _setSidebarCollapsed } = useProviderPortal();

  return (
    <div
      className={cn(
        "fixed start-0 top-0 z-40 h-screen bg-white border-e border-gray-200 transition-all duration-300 hidden md:block",
        sidebarCollapsed ? "w-16" : "w-64"
      )}
    >
      <div className="flex flex-col h-full">
        {/* Logo/Brand */}
        <div className="h-16 flex items-center justify-center border-b border-gray-200">
          {!sidebarCollapsed ? (
            <span className="text-xl font-semibold text-primary">Beautonomi</span>
          ) : (
            <span className="text-xl font-semibold text-primary">B</span>
          )}
        </div>

        {/* Menu Items */}
        <nav className="flex-1 py-4 space-y-1 px-2">
          <TooltipProvider>
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = isActiveRoute(pathname, item.href);
              
              return (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-gray-700 hover:bg-gray-100"
                      )}
                    >
                      <Icon className="w-5 h-5 flex-shrink-0" />
                      {!sidebarCollapsed && (
                        <span className="flex-1 min-w-0 flex flex-col items-start">
                          <span>{t(item.labelKey)}</span>
                          {item.href === "/provider/gamification" && (
                            <ProviderRewardsTeaser />
                          )}
                        </span>
                      )}
                    </Link>
                  </TooltipTrigger>
                  {sidebarCollapsed && (
                    <TooltipContent side="right">
                      <p>{t(item.labelKey)}</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              );
            })}
          </TooltipProvider>
        </nav>

        {/* Logout - with extra bottom padding to avoid floating button overlap */}
        <div className="border-t border-gray-200 p-2 pb-20 sm:pb-24 flex-shrink-0">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 w-full transition-colors"
                  )}
                >
                  <LogOut className="w-5 h-5 flex-shrink-0" />
                  {!sidebarCollapsed && <span>{t("web.provider.topbar.logout")}</span>}
                </button>
              </TooltipTrigger>
              {sidebarCollapsed && (
                <TooltipContent side="right">
                  <p>{t("web.provider.topbar.logout")}</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
}
