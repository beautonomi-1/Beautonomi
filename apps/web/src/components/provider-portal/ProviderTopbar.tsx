"use client";

import React from "react";
import { Bell, ChevronDown } from "lucide-react";
import { ProviderGlobalSearch } from "@/components/provider/ProviderGlobalSearch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useProviderPortal } from "@/providers/provider-portal/ProviderPortalProvider";
import { CircularProgress } from "@/components/ui/circular-progress";
import Link from "next/link";

export function ProviderTopbar() {
  const { provider, setupCompletion } = useProviderPortal();

  return (
    <div className="h-16 border-b border-gray-200 bg-white flex items-center justify-between px-4 md:px-6 w-full overflow-x-hidden">
      {/* Left: Logo (hidden on desktop, shown on mobile) */}
      <div className="md:hidden flex items-center gap-2 min-w-0 flex-shrink">
        <span className="text-xl font-semibold text-[#FF0077] whitespace-nowrap">Beautonomi</span>
        {/* Setup Progress on Mobile - Circular Wheel */}
        {setupCompletion < 100 && (
          <Link href="/provider/get-started" className="flex items-center gap-1.5 flex-shrink-0">
            <CircularProgress 
              value={setupCompletion} 
              size={36} 
              strokeWidth={3}
              showPercentage={true}
            />
            <span className="text-xs font-medium text-[#FF0077] hidden sm:inline whitespace-nowrap">
              Setup
            </span>
          </Link>
        )}
      </div>

      {/* Center: Global Search */}
      <div className="flex-1 max-w-2xl mx-4 hidden md:block min-w-0">
        <ProviderGlobalSearch placeholder="Search appointments, clients, services..." />
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-3 md:gap-5 flex-shrink-0">
        {/* Business Type Badge - Hidden on mobile if setup progress is showing */}
        {provider?.business_type && (
          <Badge
            variant="outline"
            className={`${
              provider.business_type === "freelancer"
                ? "bg-blue-50 text-blue-700 border-blue-200"
                : "bg-purple-50 text-purple-700 border-purple-200"
            } hidden sm:inline-flex`}
          >
            {provider.business_type === "freelancer" ? "Freelancer" : "Salon"}
          </Badge>
        )}
        {/* Setup Progress - Desktop - Added margin-left for better separation */}
        {setupCompletion < 100 && (
          <Link href="/provider/get-started" className="hidden md:flex items-center gap-2 ml-2">
            <CircularProgress 
              value={setupCompletion} 
              size={40} 
              strokeWidth={4}
              showPercentage={true}
            />
            <Badge
              variant="outline"
              className="bg-[#FF0077]/10 text-[#FF0077] border-[#FF0077]/20 hover:bg-[#FF0077]/20 cursor-pointer whitespace-nowrap"
            >
              Complete Setup {setupCompletion}%
            </Badge>
          </Link>
        )}

        {/* Notifications - Added margin-left for better separation from progress */}
        <Button variant="ghost" size="icon" className="relative ml-1">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-[#FF0077] rounded-full"></span>
        </Button>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 h-auto p-1">
              <Avatar className="w-8 h-8">
                <AvatarFallback className="bg-[#FF0077]/10 text-[#FF0077]">
                  {provider?.owner_name?.charAt(0) || "U"}
                </AvatarFallback>
              </Avatar>
              <span className="hidden md:block text-sm font-medium">
                {provider?.owner_name || "User"}
              </span>
              <ChevronDown className="w-4 h-4 hidden md:block" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem>Profile</DropdownMenuItem>
            <DropdownMenuItem>Settings</DropdownMenuItem>
            <DropdownMenuItem>Help</DropdownMenuItem>
            <DropdownMenuItem className="text-red-600">Logout</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
