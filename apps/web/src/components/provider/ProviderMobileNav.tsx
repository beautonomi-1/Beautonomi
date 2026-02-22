"use client";

import React, { useState } from "react";
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
  LayoutList,
  BarChart3,
  Sparkles,
  Trophy,
} from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import PlatformLogo from "@/components/platform/PlatformLogo";
import { useAuth } from "@/providers/AuthProvider";
import { usePlatformSettings } from "@/providers/PlatformSettingsProvider";
import { usePermissions } from "@/hooks/usePermissions";
import type { StaffPermissions } from "@/lib/auth/permissions";

// Navigation sections matching the desktop sidebar
const navigationSections = [
  {
    title: "Main",
    items: [
      { icon: LayoutDashboard, label: "Dashboard", href: "/provider/dashboard", permission: undefined },
      { icon: Calendar, label: "Calendar", href: "/provider/calendar", badge: "Hot", permission: "view_calendar" as keyof StaffPermissions },
      { icon: CalendarCheck, label: "Appointments", href: "/provider/appointments", permission: "view_calendar" as keyof StaffPermissions },
    ],
  },
  {
    title: "Operations",
    items: [
      { icon: LayoutList, label: "Front Desk", href: "/provider/front-desk", permission: "view_calendar" as keyof StaffPermissions },
      { icon: Clock, label: "Waitlist", href: "/provider/waitlist", permission: "view_calendar" as keyof StaffPermissions },
      { icon: UserCheck, label: "Waiting Room", href: "/provider/waiting-room", permission: "view_calendar" as keyof StaffPermissions },
      { icon: UsersRound, label: "Clients", href: "/provider/clients", permission: "view_clients" as keyof StaffPermissions },
    ],
  },
  {
    title: "Business",
    items: [
      { icon: Tag, label: "Sales", href: "/provider/sales", permission: "view_sales" as keyof StaffPermissions },
      { icon: Wallet, label: "Finance", href: "/provider/finance", permission: "view_sales" as keyof StaffPermissions },
      { icon: BarChart3, label: "Analytics", href: "/provider/analytics", permission: "view_reports" as keyof StaffPermissions },
      { icon: BarChart3, label: "Reports", href: "/provider/reports", permission: "view_reports" as keyof StaffPermissions },
      { icon: Trophy, label: "Rewards", href: "/provider/gamification", permission: undefined },
      { icon: Grid3x3, label: "Catalogue", href: "/provider/catalogue", permission: "view_products" as keyof StaffPermissions },
      { icon: Sparkles, label: "Packages", href: "/provider/packages", permission: "view_services" as keyof StaffPermissions },
    ],
  },
  {
    title: "Team & Marketing",
    items: [
      { icon: Sparkles, label: "Explore Content", href: "/provider/explore", permission: "create_explore_posts" as keyof StaffPermissions },
      { icon: Users, label: "Team", href: "/provider/team/members", permission: "view_team" as keyof StaffPermissions },
      { icon: Star, label: "Reviews", href: "/provider/reviews", permission: "view_reviews" as keyof StaffPermissions },
      { icon: MessageSquare, label: "Messages", href: "/provider/messaging", permission: "view_messages" as keyof StaffPermissions },
      { icon: Megaphone, label: "Marketing", href: "/provider/marketing/automations", permission: "edit_settings" as keyof StaffPermissions },
    ],
  },
];

const bottomItems = [
  { icon: Settings, label: "Settings", href: "/provider/settings" },
];

// Match routes including sub-routes
const isActiveRoute = (pathname: string, href: string) => {
  if (href === "/provider/catalogue") {
    return pathname.startsWith("/provider/catalogue");
  }
  if (href === "/provider/explore") {
    return pathname.startsWith("/provider/explore");
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
  if (href === "/provider/reports") {
    return pathname.startsWith("/provider/reports");
  }
  if (href === "/provider/gamification") {
    return pathname.startsWith("/provider/gamification");
  }
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

  // Filter navigation sections based on permissions
  const filteredNavigationSections = navigationSections.map(section => ({
    ...section,
    items: section.items.filter(item => {
      // If no permission required, always show
      if (!item.permission) return true;
      // If permissions are loading, show all (will filter once loaded)
      if (permissionsLoading) return true;
      // Check permission
      return hasPermission(item.permission);
    })
  })).filter(section => section.items.length > 0); // Remove empty sections

  // Filter bottom items
  const filteredBottomItems = bottomItems.filter(_item => {
    return true; // Settings is always accessible
  });

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
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="w-6 h-6" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-80 sm:w-96 bg-gradient-to-b from-[#2F2A2E] to-[#1F1A1E] text-white p-0 overflow-hidden">
        <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
        <SheetDescription className="sr-only">
          Main navigation menu for provider dashboard
        </SheetDescription>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="h-16 flex items-center justify-between px-4 border-b border-white/10 flex-shrink-0">
            <Link href="/provider/dashboard" onClick={() => setOpen(false)} className="flex items-center gap-2">
              <div 
                className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden"
                style={{
                  background: `linear-gradient(to bottom right, ${primaryColor}, ${secondaryColor})`,
                }}
              >
                <PlatformLogo alt={platformName} className="w-6 h-6" width={24} height={24} />
              </div>
              <span className="text-lg font-bold text-white">{platformName}</span>
            </Link>
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)} className="text-gray-400 hover:text-white hover:bg-white/10">
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Navigation Sections */}
          <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-4 space-y-6 scrollbar-hide">
            {filteredNavigationSections.map((section, _sectionIdx) => (
              <div key={section.title}>
                {/* Section Title */}
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2 px-3">
                  {section.title}
                </p>
                
                {/* Section Items */}
                <div className="space-y-1">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = isActiveRoute(pathname, item.href);

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className={cn(
                          "flex items-center gap-3 h-10 px-3 rounded-xl transition-all relative group",
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
          <div className="mt-auto pt-2 border-t border-white/10 px-3 space-y-1 flex-shrink-0 pb-4">
            {filteredBottomItems.map((item) => {
              const Icon = item.icon;
              const isActive = isActiveRoute(pathname, item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-3 h-10 px-3 rounded-xl transition-all",
                    isActive
                      ? "bg-white/10 text-white"
                      : "text-gray-400 hover:bg-white/10 hover:text-white"
                  )}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  <span className="text-sm font-medium">{item.label}</span>
                </Link>
              );
            })}

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 h-10 w-full rounded-xl px-3 text-gray-400 hover:bg-red-500/10 hover:text-red-400 transition-all"
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
