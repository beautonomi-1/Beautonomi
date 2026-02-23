"use client";

import React, { useState, useEffect, useRef } from "react";
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
import { fetcher } from "@/lib/http/fetcher";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function ProviderTopbar() {
  const pathname = usePathname();
  const { provider, salons, selectedLocationId, setSelectedLocation } = useProviderPortal();
  const { signOut } = useAuth();
  const { branding } = usePlatformSettings();
  const [setupCompletion, setSetupCompletion] = useState(0);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [userProfile, setUserProfile] = useState<{ avatar_url: string | null; full_name: string | null } | null>(null);
  const setupStatusIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load user profile for avatar and name
  useEffect(() => {
    const loadUserProfile = async () => {
      try {
        const response = await fetcher.get<{ data: { avatar_url: string | null; full_name: string | null } }>(
          "/api/me/profile"
        );
        setUserProfile({
          avatar_url: response.data?.avatar_url || null,
          full_name: response.data?.full_name || null,
        });
      } catch (error) {
        console.error("Failed to load user profile:", error);
      }
    };

    loadUserProfile();
    
    // Listen for profile update events
    const handleProfileUpdate = () => {
      loadUserProfile();
    };
    
    if (typeof window !== 'undefined') {
      window.addEventListener('profile-updated', handleProfileUpdate);
    }
    
    // Refresh profile every 30 seconds to catch updates
    const interval = setInterval(loadUserProfile, 30000);
    
    return () => {
      clearInterval(interval);
      if (typeof window !== 'undefined') {
        window.removeEventListener('profile-updated', handleProfileUpdate);
      }
    };
  }, []);

  // Fetch setup completion from API
  useEffect(() => {
    const loadSetupStatus = async () => {
      try {
        const response = await fetcher.get<{ data: { completionPercentage: number } }>(
          "/api/provider/setup-status"
        );
        const completion = response.data?.completionPercentage || 0;
        setSetupCompletion(completion);
        
        // Stop polling if setup is complete (100%)
        if (completion >= 100 && setupStatusIntervalRef.current) {
          clearInterval(setupStatusIntervalRef.current);
          setupStatusIntervalRef.current = null;
        }
      } catch (error) {
        console.error("Failed to load setup status:", error);
        setSetupCompletion(0);
      }
    };

    // Load immediately on mount
    loadSetupStatus();
    
    // Only poll if setup is incomplete
    // Poll every 5 minutes (300000ms) instead of 30 seconds
    // This reduces API calls by 10x (from every 30s to every 5min)
    // The interval will automatically stop when setup reaches 100%
    setupStatusIntervalRef.current = setInterval(loadSetupStatus, 300000); // 5 minutes
    
    return () => {
      if (setupStatusIntervalRef.current) {
        clearInterval(setupStatusIntervalRef.current);
        setupStatusIntervalRef.current = null;
      }
    };
  }, []);

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  // Determine if we're on the calendar page
  const isCalendarPage = pathname?.startsWith("/provider/calendar");

  return (
    <div className="sticky top-0 z-30 bg-white border-b border-gray-200 w-full max-w-full overflow-x-hidden box-border">
      <div className="h-16 flex items-center justify-between px-4 sm:px-4 md:px-6 lg:px-8 xl:px-12 max-w-[1800px] mx-auto w-full max-w-full box-border overflow-x-hidden">
        {/* Left: Logo + Mobile Nav + Breadcrumb */}
        <div className="flex items-center gap-2 sm:gap-3 md:gap-4 flex-1 min-w-0 overflow-x-hidden box-border">
          {/* Logo - Desktop */}
          <Link href="/provider/dashboard" className="hidden md:flex items-center flex-shrink-0">
            <PlatformLogo alt="Beautonomi Logo" className="h-8 w-auto" />
          </Link>
          
          {/* Mobile Menu Toggle */}
          <ProviderMobileNav />
          
          {/* Breadcrumb - Desktop */}
          <div className="hidden md:block flex-1 min-w-0 overflow-x-hidden overflow-y-visible box-border">
            <ProviderBreadcrumb />
          </div>

          {/* Mobile: Page Title */}
          <div className="md:hidden flex-1 min-w-0">
            <h1 className="text-lg font-semibold truncate">
              {isCalendarPage ? "Calendar" : provider?.business_name || branding?.site_name || "Beautonomi"}
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
        <div className="flex items-center gap-2 sm:gap-2 md:gap-3 lg:gap-4 flex-shrink-0 min-w-0 overflow-x-hidden box-border">
          {/* Quick Add Button - Desktop */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                className="hidden md:flex h-9 gap-2 px-4"
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
                    src={userProfile?.avatar_url || undefined} 
                    alt={userProfile?.full_name || "User"}
                    onError={(e) => {
                      // Hide image on error, show fallback
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                  <AvatarFallback 
                    className="text-white text-sm font-semibold"
                    style={{
                      background: `linear-gradient(to bottom right, ${branding?.primary_color || "#FF0077"}, ${branding?.secondary_color || "#4fd1c5"})`,
                    }}
                  >
                    {userProfile?.full_name?.charAt(0)?.toUpperCase() || provider?.owner_name?.charAt(0)?.toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden lg:flex flex-col items-start">
                  <span className="text-sm font-medium truncate max-w-[100px]">
                    {userProfile?.full_name || provider?.owner_name || "User"}
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
                <p className="font-medium">{userProfile?.full_name || provider?.owner_name || "User"}</p>
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
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/help" className="cursor-pointer">
                  Help Centre
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

      {/* Mobile Search Bar (shown below header on mobile) */}
      <div className="md:hidden px-4 pb-3 -mt-1 w-full max-w-full box-border overflow-x-hidden">
        <ProviderGlobalSearch
          placeholder="Search clients, appointments, services..."
          inputClassName="h-10 w-full max-w-full box-border"
        />
      </div>
    </div>
  );
}
