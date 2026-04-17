"use client";

import React, { useState, useEffect } from "react";
import { 
  ChevronDown, 
  Calendar, 
  Plus, 
  Users, 
  Clock,
  Wallet,
  Sparkles
} from "lucide-react";
import { ProviderGlobalSearch } from "./ProviderGlobalSearch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { useProviderPortal } from "@/providers/provider-portal/ProviderPortalProvider";
import { ProviderBreadcrumb } from "./ProviderBreadcrumb";
import { ProviderMobileNav } from "./ProviderMobileNav";
import { ProviderNotificationsDropdown } from "./ProviderNotificationsDropdown";
import { LocationSwitcher } from "./LocationSwitcher";
import PlatformLogo from "@/components/platform/PlatformLogo";
import { useAuth } from "@/providers/AuthProvider";
import { usePlatformSettings } from "@/providers/PlatformSettingsProvider";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function ProviderTopbar() {
  const pathname = usePathname();
  const { provider, salons, selectedLocationId, setSelectedLocation, setupCompletion } = useProviderPortal();
  // Use AuthProvider directly — it already holds avatar_url/full_name and handles
  // its own caching/refresh.  No separate /api/me/profile poll needed.
  const { user, signOut, refreshUser } = useAuth();
  const { branding } = usePlatformSettings();
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Re-fetch user profile when the app fires a 'profile-updated' event
  // (e.g. after the user saves their avatar on the settings page).
  useEffect(() => {
    const handleProfileUpdate = () => { refreshUser().catch(() => {}); };
    window.addEventListener("profile-updated", handleProfileUpdate);
    return () => window.removeEventListener("profile-updated", handleProfileUpdate);
  }, [refreshUser]);

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  const isCalendarPage = pathname?.startsWith("/provider/calendar");

  const mobilePageTitle = (() => {
    if (!pathname) return provider?.business_name || branding?.site_name || "Beautonomi";
    const segments: [string, string][] = [
      ["/provider/calendar", "Calendar"],
      ["/provider/dashboard", "Dashboard"],
      ["/provider/clients", "Clients"],
      ["/provider/bookings", "Bookings"],
      ["/provider/appointments", "Bookings"],
      ["/provider/sales", "Sales"],
      ["/provider/finance", "Finance"],
      ["/provider/analytics", "Analytics"],
      ["/provider/reports", "Reports"],
      ["/provider/messaging", "Messages"],
      ["/provider/settings", "Settings"],
      ["/provider/team", "Team"],
      ["/provider/catalogue", "Catalogue"],
      ["/provider/ecommerce", "E-Commerce"],
      ["/provider/notifications", "Notifications"],
      ["/provider/waitlist", "Waitlist"],
      ["/provider/waiting-room", "Waiting Room"],
      ["/provider/explore", "Explore"],
      ["/provider/packages", "Packages"],
      ["/provider/payouts", "Payouts"],
      ["/provider/reviews", "Reviews"],
      ["/provider/schedule", "Schedule"],
      ["/provider/forms", "Forms"],
      ["/provider/resources", "Resources"],
      ["/provider/subscription", "Subscription"],
      ["/provider/orders", "Orders"],
      ["/provider/recurring-appointments", "Recurring"],
      ["/provider/express-booking", "Booking links"],
      ["/provider/front-desk", "Front desk"],
      ["/provider/gamification", "Rewards"],
    ];
    for (const [prefix, title] of segments) {
      if (pathname.startsWith(prefix)) return title;
    }
    return provider?.business_name || branding?.site_name || "Beautonomi";
  })();

  return (
    <div className="sticky top-0 z-30 bg-white border-b border-gray-200 w-full max-w-full overflow-x-hidden box-border">
      <div className="h-14 md:h-16 flex items-center justify-between px-3 sm:px-4 md:px-6 lg:px-8 xl:px-12 mx-auto w-full max-w-full box-border overflow-x-hidden">
        {/* Left: Logo + Mobile Nav + Breadcrumb */}
        <div className="flex items-center gap-2 sm:gap-3 md:gap-4 flex-1 min-w-0 overflow-x-hidden box-border">
          <Link
            href="/provider/dashboard"
            className="hidden md:flex items-center justify-center flex-shrink-0 rounded-lg bg-white p-1 shadow-sm ring-1 ring-primary/20 hover:ring-primary/35 transition-shadow"
          >
            <PlatformLogo
              alt={branding?.site_name ? `${branding.site_name} logo` : "Beautonomi logo"}
              className="h-7 w-auto max-h-7 object-contain"
            />
          </Link>
          
          <ProviderMobileNav />
          
          <div className="hidden md:block flex-1 min-w-0 overflow-x-hidden overflow-y-visible box-border">
            <ProviderBreadcrumb />
          </div>

          <div className="md:hidden flex-1 min-w-0">
            <h1 className="text-base font-semibold truncate">
              {mobilePageTitle}
            </h1>
          </div>
        </div>

        {/* Center: Global Search (desktop only) */}
        <div className="flex-1 max-w-md mx-2 lg:mx-4 hidden lg:block min-w-0">
          <div className={cn(
            "relative w-full transition-all duration-200",
            isSearchFocused && "scale-[1.02]"
          )}>
            <ProviderGlobalSearch
              placeholder="Search clients, appointments, services..."
              inputClassName={cn(
                "transition-all duration-200",
                isSearchFocused && "bg-white ring-2"
              )}
              inputStyle={isSearchFocused ? {
                borderColor: `${branding?.primary_color || "#FF0077"}4D`,
                boxShadow: `0 0 0 2px ${branding?.primary_color || "#FF0077"}1A`,
              } : undefined}
              onFocusChange={setIsSearchFocused}
            />
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3 lg:gap-4 flex-shrink-0 min-w-0 overflow-x-hidden box-border">
          {/* Quick Add Button - all viewports */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                aria-label="Quick actions"
                className="min-h-[44px] min-w-[44px] h-11 w-11 shrink-0 md:h-9 md:w-auto md:min-h-0 md:min-w-0 md:gap-2 md:px-4 p-0 md:p-2 rounded-full md:rounded-md touch-manipulation"
                style={{
                  backgroundColor: branding?.primary_color || "#FF0077",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = branding?.secondary_color || "#D60565";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = branding?.primary_color || "#FF0077";
                }}
              >
                <Plus className="w-4 h-4" />
                <span className="hidden lg:inline">New</span>
                <ChevronDown className="w-3 h-3 hidden lg:inline" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-xs text-gray-500 uppercase tracking-wide">
                Quick Actions
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/provider/calendar" className="flex items-center gap-3 cursor-pointer">
                  <div className="w-8 h-8 rounded-lg bg-[#4fd1c5]/10 flex items-center justify-center">
                    <Calendar className="w-4 h-4 text-[#4fd1c5]" />
                  </div>
                  <div>
                    <p className="font-medium">New Appointment</p>
                    <p className="text-xs text-gray-500">Book a client</p>
                  </div>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/provider/clients" className="flex items-center gap-3 cursor-pointer">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <Users className="w-4 h-4 text-blue-500" />
                  </div>
                  <div>
                    <p className="font-medium">New Client</p>
                    <p className="text-xs text-gray-500">Add to database</p>
                  </div>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/provider/sales" className="flex items-center gap-3 cursor-pointer">
                  <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                    <Wallet className="w-4 h-4 text-green-500" />
                  </div>
                  <div>
                    <p className="font-medium">New Sale</p>
                    <p className="text-xs text-gray-500">Record a transaction</p>
                  </div>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/provider/waitlist" className="flex items-center gap-3 cursor-pointer">
                  <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
                    <Clock className="w-4 h-4 text-orange-500" />
                  </div>
                  <div>
                    <p className="font-medium">Add to Waitlist</p>
                    <p className="text-xs text-gray-500">Queue a client</p>
                  </div>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/provider/explore/new" className="flex items-center gap-3 cursor-pointer">
                  <div className="w-8 h-8 rounded-lg bg-pink-500/10 flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-pink-500" />
                  </div>
                  <div>
                    <p className="font-medium">Create Explore Post</p>
                    <p className="text-xs text-gray-500">Share to the explore feed</p>
                  </div>
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Setup Progress - Desktop - Added margin for better separation from New button */}
          {setupCompletion < 100 && (
            <Link href="/provider/get-started" className="hidden sm:block flex-shrink-0 ml-1">
                <Badge
                  variant="outline"
                  className={cn(
                    "cursor-pointer whitespace-nowrap text-xs h-8 px-3 gap-1.5 transition-all"
                  )}
                  style={{
                    background: `linear-gradient(to right, ${branding?.primary_color || "#FF0077"}1A, ${branding?.secondary_color || "#4fd1c5"}1A)`,
                    color: branding?.primary_color || "#FF0077",
                    borderColor: `${branding?.primary_color || "#FF0077"}33`,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = `linear-gradient(to right, ${branding?.primary_color || "#FF0077"}33, ${branding?.secondary_color || "#4fd1c5"}33)`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = `linear-gradient(to right, ${branding?.primary_color || "#FF0077"}1A, ${branding?.secondary_color || "#4fd1c5"}1A)`;
                  }}
                >
                <Sparkles className="w-3 h-3" />
                {setupCompletion}% Complete
              </Badge>
            </Link>
          )}

          {/* Setup Progress - Mobile (Circular) */}
          {setupCompletion < 100 && (
            <Link href="/provider/get-started" className="sm:hidden flex-shrink-0">
              <div className="relative w-10 h-10 flex items-center justify-center">
                {/* Circular progress background */}
                <svg className="w-10 h-10 transform -rotate-90" viewBox="0 0 36 36">
                  <circle
                    cx="18"
                    cy="18"
                    r="16"
                    fill="none"
                    stroke="#e5e7eb"
                    strokeWidth="2"
                  />
                  <circle
                    cx="18"
                    cy="18"
                    r="16"
                    fill="none"
                    stroke={branding?.primary_color || "#FF0077"}
                    strokeWidth="2"
                    strokeDasharray={`${(setupCompletion / 100) * 100.53}, 100.53`}
                    strokeLinecap="round"
                    className="transition-all duration-300"
                  />
                </svg>
                {/* Percentage text */}
                <span 
                  className="absolute text-[10px] font-bold"
                  style={{ color: branding?.primary_color || "#FF0077" }}
                >
                  {setupCompletion}%
                </span>
              </div>
            </Link>
          )}

          {/* Location Switcher - Only show if multiple locations */}
          {salons.length > 1 && (
            <div className="flex-shrink-0">
              <LocationSwitcher
                locations={salons}
                selectedLocationId={selectedLocationId}
                onLocationChange={setSelectedLocation}
              />
            </div>
          )}

          {/* Notifications */}
          <div className="flex-shrink-0">
            <ProviderNotificationsDropdown />
          </div>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                className={cn(
                  "flex items-center gap-1 sm:gap-2 h-10 p-1.5 flex-shrink-0",
                  "rounded-xl hover:bg-gray-100 transition-colors"
                )}
              >
                <Avatar className="w-8 h-8 ring-2 ring-gray-100">
                  <AvatarImage
                    src={user?.avatar_url || undefined}
                    alt={user?.full_name || "User"}
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                  />
                  <AvatarFallback
                    className="text-white text-sm font-semibold"
                    style={{
                      background: `linear-gradient(to bottom right, ${branding?.primary_color || "#FF0077"}, ${branding?.secondary_color || "#4fd1c5"})`,
                    }}
                  >
                    {user?.full_name?.charAt(0)?.toUpperCase() || provider?.owner_name?.charAt(0)?.toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden lg:flex flex-col items-start">
                  <span className="text-sm font-medium truncate max-w-[100px]">
                    {user?.full_name || provider?.owner_name || "User"}
                  </span>
                  <span className="text-[10px] text-gray-500 truncate max-w-[100px]">
                    {provider?.business_name || "Business"}
                  </span>
                </div>
                <ChevronDown className="w-4 h-4 hidden lg:block text-gray-400" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {/* User Info Header */}
              <div className="px-3 py-2 border-b">
                <p className="font-medium">{user?.full_name || provider?.owner_name || "User"}</p>
                <p className="text-xs text-gray-500 truncate">{provider?.business_name}</p>
              </div>
              
              <DropdownMenuItem asChild>
                <Link href="/provider/account/profile" className="cursor-pointer">
                  My Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/provider/settings" className="cursor-pointer">
                  Business Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/provider/subscription" className="cursor-pointer">
                  Subscription
                </Link>
              </DropdownMenuItem>
              {/*
                §Provider-launch (audit 2026-04): the user menu used to
                skip straight from Subscription to the Help Centre, so
                providers had no in-portal surface for password/2FA,
                session management, privacy controls, or data export /
                deletion requests. These three entries expose the
                user-scoped /account-settings pages that already exist.
              */}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/account-settings/login-and-security" className="cursor-pointer">
                  Login & Security
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/account-settings/privacy-and-sharing" className="cursor-pointer">
                  Privacy & Sharing
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link
                  href="/account-settings/privacy-and-sharing#data-rights"
                  className="cursor-pointer"
                >
                  Data Rights & Export
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/help" className="cursor-pointer">
                  Help Centre
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/learn" className="cursor-pointer">
                  Learning Center
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/help/submit-ticket" className="cursor-pointer">
                  Contact support
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/provider/resources" className="cursor-pointer">
                  Resources
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={handleLogout}
                className="text-red-600 focus:text-red-600 focus:bg-red-50 cursor-pointer"
              >
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Mobile Search Bar — collapsed by default, tap to expand */}
      <div className="md:hidden px-3 pb-2 -mt-0.5 w-full max-w-full box-border overflow-x-hidden">
        <ProviderGlobalSearch
          placeholder="Search..."
          inputClassName="h-9 w-full max-w-full box-border text-sm"
        />
      </div>
    </div>
  );
}
