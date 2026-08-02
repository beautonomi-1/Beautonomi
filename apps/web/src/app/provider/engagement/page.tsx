"use client";

import Link from "next/link";
import { PageHeader } from "@/components/provider/PageHeader";
import { ChevronRight, MessageSquare, Megaphone, Star } from "lucide-react";

const ITEMS = [
  {
    icon: Star,
    label: "Reviews",
    subtitle: "Respond to customer feedback",
    href: "/provider/reviews",
  },
  {
    icon: MessageSquare,
    label: "Messages",
    subtitle: "Client conversations & custom offers",
    href: "/provider/messaging",
  },
  {
    icon: Megaphone,
    label: "Marketing campaigns",
    subtitle: "Email, SMS & WhatsApp campaigns",
    href: "/provider/marketing/campaigns",
  },
];

export default function EngagementHubPage() {
  return (
    <div>
      <PageHeader
        title="Engagement"
        subtitle="Reviews, messaging & marketing"
        breadcrumbs={[
          { label: "More", href: "/provider/more" },
          { label: "Engagement" },
        ]}
      />
      <div className="mt-6 space-y-2">
        {ITEMS.map((item) => {
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
