"use client";

import React, { useState, useEffect } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
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
import { useTranslation } from "@beautonomi/i18n";
import { PreferencesTrigger } from "@/components/global/PreferencesTrigger";
import { useOpenGlobalPreferences } from "@/components/global/GlobalPreferencesDialog";

export function ProviderTopbar() {
  const { t } = useTranslation();
  const openPreferences = useOpenGlobalPreferences();
  const pathname = usePathname();
  const { provider, salons, selectedLocationId, setSelectedLocation, setupCompletion, setupStatusKnown } = useProviderPortal();
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
    if (!pathname) return provider?.business_name || branding?.site_name || t("web.seo.siteName");
    const segments: [string, string][] = [
      ["/provider/calendar", t("web.provider.topbar.mobileTitles.calendar")],
      ["/provider/dashboard", t("web.provider.topbar.mobileTitles.dashboard")],
      ["/provider/clients", t("web.provider.topbar.mobileTitles.clients")],
      ["/provider/bookings", t("web.provider.topbar.mobileTitles.bookings")],
      ["/provider/appointments", t("web.provider.topbar.mobileTitles.bookings")],
      ["/provider/sales", t("web.provider.topbar.mobileTitles.sales")],
      ["/provider/finance", t("web.provider.topbar.mobileTitles.finance")],
      ["/provider/analytics", t("web.provider.topbar.mobileTitles.analytics")],
      ["/provider/reports", t("web.provider.topbar.mobileTitles.reports")],
      ["/provider/messaging", t("web.provider.topbar.mobileTitles.messages")],
      ["/provider/settings", t("web.provider.topbar.mobileTitles.settings")],
      ["/provider/team", t("web.provider.topbar.mobileTitles.team")],
      ["/provider/catalogue", t("web.provider.topbar.mobileTitles.catalogue")],
      ["/provider/ecommerce", t("web.provider.topbar.mobileTitles.ecommerce")],
      ["/provider/notifications", t("web.provider.topbar.mobileTitles.notifications")],
      ["/provider/waitlist", t("web.provider.topbar.mobileTitles.waitlist")],
      ["/provider/waiting-room", t("web.provider.topbar.mobileTitles.waitingRoom")],
      ["/provider/explore", t("web.provider.topbar.mobileTitles.explore")],
      ["/provider/packages", t("web.provider.topbar.mobileTitles.packages")],
      ["/provider/payouts", t("web.provider.topbar.mobileTitles.payouts")],
      ["/provider/reviews", t("web.provider.topbar.mobileTitles.reviews")],
      ["/provider/schedule", t("web.provider.topbar.mobileTitles.schedule")],
      ["/provider/forms", t("web.provider.topbar.mobileTitles.forms")],
      ["/provider/resources", t("web.provider.topbar.mobileTitles.resources")],
      ["/provider/subscription", t("web.provider.topbar.mobileTitles.subscription")],
      ["/provider/orders", t("web.provider.topbar.mobileTitles.orders")],
      ["/provider/recurring-appointments", t("web.provider.topbar.mobileTitles.recurring")],
      ["/provider/express-booking", t("web.provider.topbar.mobileTitles.bookingLinks")],
      ["/provider/front-desk", t("web.provider.topbar.mobileTitles.frontDesk")],
      ["/provider/more", t("web.provider.topbar.mobileTitles.more")],
      ["/provider/gamification", t("web.provider.topbar.mobileTitles.rewards")],
    ];
    for (const [prefix, title] of segments) {
      if (pathname.startsWith(prefix)) return title;
    }
    return provider?.business_name || branding?.site_name || t("web.seo.siteName");
  })();

  return (
    <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-gray-200 w-full max-w-full overflow-x-hidden box-border safe-area-top">
      <div className="h-14 md:h-[4.25rem] flex items-center justify-between px-3 sm:px-4 md:px-6 lg:px-8 xl:px-10 mx-auto w-full max-w-full box-border overflow-x-hidden">
        {/* Left: Logo + Mobile Nav + Breadcrumb */}
        <div className="flex items-center gap-2 sm:gap-3 md:gap-4 flex-1 min-w-0 overflow-x-hidden box-border">
          <Link
            href="/provider/dashboard"
            className="hidden md:flex items-center justify-center flex-shrink-0 rounded-lg bg-white p-1 shadow-sm ring-1 ring-primary/20 hover:ring-primary/35 transition-shadow"
          >
            <PlatformLogo
              alt={t("web.provider.topbar.logoAlt", { name: branding?.site_name || t("web.seo.siteName") })}
              className="h-7 w-auto max-h-7 object-contain"
            />
          </Link>
          
          <ProviderMobileNav />
          
          <div className="hidden md:block flex-1 min-w-0 overflow-x-hidden overflow-y-visible box-border">
            <ProviderBreadcrumb />
          </div>

          <div className="md:hidden flex-1 min-w-0">
            <h1 className="text-base font-bold text-gray-900 truncate tracking-tight">
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
              placeholder={t("web.provider.topbar.searchPlaceholder")}
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
          {/* Setup Progress - Desktop */}
          {setupStatusKnown && setupCompletion < 100 && (
            <Link href="/provider/get-started" className="hidden sm:block flex-shrink-0 ms-1">
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
                {t("web.provider.topbar.setupComplete", { percent: setupCompletion })}
              </Badge>
            </Link>
          )}

          {/* Setup Progress - Mobile (Circular) */}
          {setupStatusKnown && setupCompletion < 100 && (
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

          <div className="flex-shrink-0">
            <PreferencesTrigger
              variant="header"
              iconOnly
              onClick={() => openPreferences({ surface: "navbar" })}
            />
          </div>

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
                    alt={user?.full_name || t("web.provider.topbar.userFallback")}
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
                    {user?.full_name || provider?.owner_name || t("web.provider.topbar.userFallback")}
                  </span>
                  <span className="text-[10px] text-gray-500 truncate max-w-[100px]">
                    {provider?.business_name || t("web.provider.topbar.businessFallback")}
                  </span>
                </div>
                <ChevronDown className="w-4 h-4 hidden lg:block text-gray-400" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {/* User Info Header */}
              <div className="px-3 py-2 border-b">
                <p className="font-medium">{user?.full_name || provider?.owner_name || t("web.provider.topbar.userFallback")}</p>
                <p className="text-xs text-gray-500 truncate">{provider?.business_name}</p>
              </div>
              
              <DropdownMenuItem asChild>
                <Link href="/provider/account/profile" className="cursor-pointer">
                  {t("web.provider.topbar.menu.myProfile")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/provider/settings" className="cursor-pointer">
                  {t("web.provider.topbar.menu.businessSettings")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/provider/subscription" className="cursor-pointer">
                  {t("web.provider.topbar.menu.subscription")}
                </Link>
              </DropdownMenuItem>
              {/* Account routes stay inside the provider shell, but reuse user-scoped APIs. */}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/provider/account/login-and-security" className="cursor-pointer">
                  {t("web.provider.topbar.menu.loginSecurity")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/provider/account/privacy-and-sharing" className="cursor-pointer">
                  {t("web.provider.topbar.menu.privacySharing")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/provider/account/preferences" className="cursor-pointer">
                  {t("common.appLanguage")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link
                  href="/provider/account/data-rights"
                  className="cursor-pointer"
                >
                  {t("web.provider.topbar.menu.dataRights")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/help" className="cursor-pointer">
                  {t("web.provider.topbar.menu.helpCentre")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/learn" className="cursor-pointer">
                  {t("web.provider.topbar.menu.learningCenter")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/help/submit-ticket" className="cursor-pointer">
                  {t("web.provider.topbar.menu.contactSupport")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/provider/resources" className="cursor-pointer">
                  {t("web.provider.topbar.menu.resources")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={handleLogout}
                className="text-red-600 focus:text-red-600 focus:bg-red-50 cursor-pointer"
              >
                {t("web.provider.topbar.menu.signOut")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Mobile Search Bar — collapsed by default, tap to expand */}
      <div className="md:hidden px-3 pb-2 -mt-0.5 w-full max-w-full box-border overflow-x-hidden">
        <ProviderGlobalSearch
          placeholder={t("web.provider.topbar.searchPlaceholderMobile")}
          inputClassName="h-9 w-full max-w-full box-border text-sm"
        />
      </div>
    </div>
  );
}
