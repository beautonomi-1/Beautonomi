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
import { useTranslation } from "@beautonomi/i18n";

export function ProviderTopbar() {
  const { t } = useTranslation();
  const { provider, setupCompletion } = useProviderPortal();

  return (
    <div className="h-16 border-b border-gray-200 bg-white flex items-center justify-between px-4 md:px-6 w-full overflow-x-hidden">
      {/* Left: Logo (hidden on desktop, shown on mobile) */}
      <div className="md:hidden flex items-center gap-2 min-w-0 flex-shrink">
        <span className="text-xl font-semibold text-primary whitespace-nowrap">{t("web.seo.siteName")}</span>
        {/* Setup Progress on Mobile - Circular Wheel */}
        {setupCompletion < 100 && (
          <Link href="/provider/get-started" className="flex items-center gap-1.5 flex-shrink-0">
            <CircularProgress 
              value={setupCompletion} 
              size={36} 
              strokeWidth={3}
              showPercentage={true}
            />
            <span className="text-xs font-medium text-primary hidden sm:inline whitespace-nowrap">
              {t("web.provider.topbar.setup")}
            </span>
          </Link>
        )}
      </div>

      {/* Center: Global Search */}
      <div className="flex-1 max-w-2xl mx-4 hidden md:block min-w-0">
        <ProviderGlobalSearch placeholder={t("web.provider.topbar.searchPlaceholder")} />
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
            {provider.business_type === "freelancer"
              ? t("web.provider.topbar.freelancer")
              : t("web.provider.topbar.salon")}
          </Badge>
        )}
        {/* Setup Progress - Desktop - Added margin-inline-start for better separation */}
        {setupCompletion < 100 && (
          <Link href="/provider/get-started" className="hidden md:flex items-center gap-2 ms-2">
            <CircularProgress 
              value={setupCompletion} 
              size={40} 
              strokeWidth={4}
              showPercentage={true}
            />
            <Badge
              variant="outline"
              className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 cursor-pointer whitespace-nowrap"
            >
              {t("web.provider.topbar.completeSetup", { percent: setupCompletion })}
            </Badge>
          </Link>
        )}

        {/* Notifications - Added margin-inline-start for better separation from progress */}
        <Button variant="ghost" size="icon" className="relative ms-1">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1 end-1 w-2 h-2 bg-primary rounded-full"></span>
        </Button>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 h-auto p-1">
              <Avatar className="w-8 h-8">
                <AvatarFallback className="bg-primary/10 text-primary">
                  {provider?.owner_name?.charAt(0) || "U"}
                </AvatarFallback>
              </Avatar>
              <span className="hidden md:block text-sm font-medium">
                {provider?.owner_name || t("web.provider.topbar.userFallback")}
              </span>
              <ChevronDown className="w-4 h-4 hidden md:block" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem>{t("web.provider.topbar.profile")}</DropdownMenuItem>
            <DropdownMenuItem>{t("web.provider.topbar.settings")}</DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/help">{t("web.provider.topbar.menu.helpCentre")}</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/help/my-tickets">{t("web.provider.topbar.myTickets")}</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/learn">{t("web.provider.topbar.menu.learningCenter")}</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/help/submit-ticket">{t("web.provider.topbar.menu.contactSupport")}</Link>
            </DropdownMenuItem>
            <DropdownMenuItem className="text-red-600">{t("web.provider.topbar.logout")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
