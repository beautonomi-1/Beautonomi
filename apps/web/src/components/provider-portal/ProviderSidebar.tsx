"use client";

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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useProviderPortal } from "@/providers/provider-portal/ProviderPortalProvider";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const menuItems = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/provider/dashboard" },
  { icon: Calendar, label: "Calendar", href: "/provider/calendar" },
  { icon: ListChecks, label: "Waitlist", href: "/provider/waitlist" },
  { icon: Repeat, label: "Recurring", href: "/provider/recurring-appointments" },
  { icon: Tag, label: "Sales", href: "/provider/sales" },
  { icon: Smile, label: "Clients", href: "/provider/clients" },
  { icon: Grid3x3, label: "Catalogue", href: "/provider/catalogue/products" },
  { icon: Package, label: "Resources", href: "/provider/resources" },
  { icon: Megaphone, label: "Marketing", href: "/provider/marketing/automations" },
  { icon: LinkIcon, label: "Booking Links", href: "/provider/express-booking" },
  { icon: Users, label: "Team", href: "/provider/team/members" },
  { icon: Settings, label: "Settings", href: "/provider/settings" },
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
  return pathname === href || pathname.startsWith(href + "/");
};

export function ProviderSidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, setSidebarCollapsed: _setSidebarCollapsed } = useProviderPortal();

  return (
    <div
      className={cn(
        "fixed left-0 top-0 z-40 h-screen bg-white border-r border-gray-200 transition-all duration-300 hidden md:block",
        sidebarCollapsed ? "w-16" : "w-64"
      )}
    >
      <div className="flex flex-col h-full">
        {/* Logo/Brand */}
        <div className="h-16 flex items-center justify-center border-b border-gray-200">
          {!sidebarCollapsed ? (
            <span className="text-xl font-semibold text-[#FF0077]">Beautonomi</span>
          ) : (
            <span className="text-xl font-semibold text-[#FF0077]">B</span>
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
                          ? "bg-[#FF0077]/10 text-[#FF0077]"
                          : "text-gray-700 hover:bg-gray-100"
                      )}
                    >
                      <Icon className="w-5 h-5 flex-shrink-0" />
                      {!sidebarCollapsed && <span>{item.label}</span>}
                    </Link>
                  </TooltipTrigger>
                  {sidebarCollapsed && (
                    <TooltipContent side="right">
                      <p>{item.label}</p>
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
                  {!sidebarCollapsed && <span>Logout</span>}
                </button>
              </TooltipTrigger>
              {sidebarCollapsed && (
                <TooltipContent side="right">
                  <p>Logout</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
}
