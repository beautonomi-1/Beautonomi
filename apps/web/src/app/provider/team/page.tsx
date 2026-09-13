"use client";

import { useTranslation } from "@beautonomi/i18n";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/provider/PageHeader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { providerApi } from "@/lib/provider-portal/api";
import {
  Users,
  DollarSign,
  CalendarOff,
  CalendarRange,
  Clock,
  BarChart3,
  ChevronRight,
  Shield,
  Bell,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function TeamHubPage() {
  const { t } = useTranslation();
  const items = [
    { label: t("web.provider.sidebar.items.teamMembers"), href: "/provider/team/members", icon: Users, description: t("web.provider.pages.team.membersDesc") },
    { label: t("web.provider.settings.pages.team/permissions.permissions"), href: "/provider/settings/team/permissions", icon: Shield, description: t("web.provider.pages.team.permissionsDesc") },
    { label: t("web.provider.pages.team.notifications"), href: "/provider/settings/team/notifications", icon: Bell, description: t("web.provider.pages.team.notificationsDesc") },
    { label: t("web.provider.sidebar.items.myEarnings"), href: "/provider/team/my-earnings", icon: DollarSign, description: t("web.provider.pages.team.earningsDesc") },
    { label: t("web.provider.sidebar.items.daysOff"), href: "/provider/team/days-off", icon: CalendarOff, description: t("web.provider.pages.team.daysOffDesc") },
    { label: t("web.provider.sidebar.items.shifts"), href: "/provider/team/shifts", icon: CalendarRange, description: t("web.provider.pages.team.shiftsDesc") },
    { label: t("web.provider.pages.team/time-clock.title"), href: "/provider/team/time-clock", icon: Clock, description: t("web.provider.pages.team.timeClockDesc") },
    { label: t("web.provider.sidebar.items.payroll"), href: "/provider/team/payroll", icon: DollarSign, description: t("web.provider.pages.team.payrollDesc") },
    { label: t("web.provider.pages.team.totals"), href: "/provider/team/totals", icon: BarChart3, description: t("web.provider.pages.team.totalsDesc") },
  ];
  const [overCapUntil, setOverCapUntil] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void providerApi.listTeamMembers().then((members) => {
      if (cancelled) return;
      const soonest = members
        .map((m) => m.over_cap_grace_until)
        .filter((v): v is string => !!v)
        .map((v) => new Date(v).getTime())
        .filter((t) => Number.isFinite(t) && t > Date.now())
        .sort((a, b) => a - b)[0];
      setOverCapUntil(soonest ?? null);
    }).catch(() => {
      if (!cancelled) setOverCapUntil(null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <PageHeader
title={t("web.provider.sidebar.items.team")}
subtitle={t("web.provider.pages.team.subtitle")}
        breadcrumbs={[
{ label: t("web.provider.common.breadcrumbHome"), href: "/provider/dashboard" },
{ label: t("web.provider.sidebar.items.team") },
        ]}
      />

      {overCapUntil ? (
        <Alert className="mt-4 border-amber-200 bg-amber-50">
          <Info className="w-4 h-4 text-amber-700" />
          <AlertDescription className="text-amber-900">
{t("web.provider.teamMembers.overCap", { date: new Date(overCapUntil).toLocaleDateString() })}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center justify-between p-6 rounded-xl border border-gray-200",
                "bg-white hover:bg-gray-50 hover:border-gray-300 transition-colors"
              )}
            >
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 text-gray-600">
                  <Icon className="h-6 w-6" />
                </div>
                <div>
                  <span className="font-semibold text-gray-900">{item.label}</span>
                  <p className="text-sm text-gray-500 mt-0.5">{item.description}</p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-400 flex-shrink-0" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
