"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "@beautonomi/i18n";

export function ProviderBreadcrumb() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const routeLabels: Record<string, string> = {
    dashboard: t("web.provider.sidebar.items.dashboard"),
    calendar: t("web.provider.sidebar.items.calendar"),
    appointments: t("web.provider.breadcrumb.appointments"),
    sales: t("web.provider.sidebar.items.sales"),
    payments: t("web.provider.breadcrumb.payments"),
    catalogue: t("web.provider.sidebar.items.catalogue"),
    products: t("web.provider.sidebar.items.products"),
    services: t("web.provider.sidebar.items.services"),
    marketing: t("web.provider.sidebar.items.marketing"),
    "blast-campaigns": t("web.provider.breadcrumb.blastCampaigns"),
    automations: t("provider.mobile.screens.settingsIndex.automations"),
    team: t("web.provider.sidebar.items.team"),
    members: t("web.provider.sidebar.items.members"),
    shifts: t("web.provider.breadcrumb.scheduledShifts"),
    settings: t("web.provider.settings.pageTitle"),
    "appointment-activity": t("web.provider.settings.tabs.appointmentActivity"),
    clients: t("web.provider.sidebar.items.clients"),
    billing: t("provider.mobile.screens.settingsIndex.billingInvoices"),
    locations: t("web.provider.sidebar.items.locations"),
    account: t("web.provider.settings.tabs.account"),
    profile: t("web.provider.breadcrumb.profile"),
  };

  const paths = pathname
    .split("/")
    .filter((p) => p && p !== "provider")
    .map((p) => ({
      path: p,
      label: routeLabels[p] || p.charAt(0).toUpperCase() + p.slice(1).replace(/-/g, " "),
    }));

  if (paths.length === 0) return null;

  return (
    <div className="flex items-center gap-2 text-sm text-gray-600 overflow-hidden">
      <Link
        href="/provider/dashboard"
        className="flex items-center gap-1 hover:text-primary transition-colors flex-shrink-0"
      >
        <Home className="w-4 h-4 flex-shrink-0" />
        <span className="truncate">{t("web.provider.sidebar.items.dashboard")}</span>
      </Link>
      {paths.map((item, index) => {
        const isLast = index === paths.length - 1;
        const href = `/provider/${paths.slice(0, index + 1).map((p) => p.path).join("/")}`;

        return (
          <React.Fragment key={item.path}>
            <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
            {isLast ? (
              <span className="text-gray-900 font-medium truncate">{item.label}</span>
            ) : (
              <Link
                href={href}
                className="hover:text-primary transition-colors truncate"
              >
                {item.label}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
