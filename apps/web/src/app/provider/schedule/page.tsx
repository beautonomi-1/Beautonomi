"use client";

import { useTranslation } from "@beautonomi/i18n";
import React from "react";
import Link from "next/link";
import { PageHeader } from "@/components/provider/PageHeader";
import { CalendarRange, CalendarOff, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ScheduleHubPage() {
  const { t } = useTranslation();
  const items = [
    { label: t("web.provider.sidebar.items.timeBlocks"), href: "/provider/time-blocks", icon: CalendarRange, description: t("web.provider.pages.schedule.timeBlocksDesc") },
    { label: t("web.provider.sidebar.items.daysOff"), href: "/provider/team/days-off", icon: CalendarOff, description: t("web.provider.pages.schedule.daysOffDesc") },
  ];
  return (
    <div>
      <PageHeader
title={t("web.provider.sidebar.items.schedule")}
subtitle={t("web.provider.pages.schedule.subtitle")}
        breadcrumbs={[
{ label: t("web.provider.common.breadcrumbHome"), href: "/provider/dashboard" },
{ label: t("web.provider.sidebar.items.schedule") },
        ]}
      />

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
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
