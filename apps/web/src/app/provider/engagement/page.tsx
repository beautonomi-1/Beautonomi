"use client";

import { useTranslation } from "@beautonomi/i18n";
import Link from "next/link";
import { PageHeader } from "@/components/provider/PageHeader";
import { ChevronRight, MessageSquare, Megaphone, Star } from "lucide-react";

export default function EngagementHubPage() {
  const { t } = useTranslation();
  const items = [
    {
      icon: Star,
      label: t("web.provider.sidebar.items.reviews"),
      subtitle: t("web.provider.pages.engagement.reviewsDesc"),
      href: "/provider/reviews",
    },
    {
      icon: MessageSquare,
      label: t("web.provider.sidebar.items.messages"),
      subtitle: t("web.provider.pages.engagement.messagesDesc"),
      href: "/provider/messaging",
    },
    {
      icon: Megaphone,
      label: t("web.provider.pages.engagement.campaigns"),
      subtitle: t("web.provider.pages.engagement.campaignsDesc"),
      href: "/provider/marketing/campaigns",
    },
  ];
  return (
    <div>
      <PageHeader
title={t("web.provider.pages.engagement.title")}
subtitle={t("web.provider.pages.engagement.subtitle")}
        breadcrumbs={[
{ label: t("web.provider.moreHub.title"), href: "/provider/more" },
{ label: t("web.provider.pages.engagement.title") },
        ]}
      />
      <div className="mt-6 space-y-2">
{items.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50">
                <Icon className="h-5 w-5 text-indigo-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900">{item.label}</p>
                <p className="text-sm text-gray-500">{item.subtitle}</p>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-300" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
