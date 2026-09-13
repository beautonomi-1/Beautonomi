"use client";

import { useTranslation } from "@beautonomi/i18n";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Calendar,
  Package,
  Star,
  BarChart3,
  Settings,
  ClipboardList,
  MessageSquare
} from "lucide-react";
import { cn } from "@/lib/utils";

const providerNavItems = [
  { nameKey: "web.provider.sidebar.items.dashboard", descriptionKey: "web.layout.providerNav.dashboardDesc", href: "/provider/dashboard", icon: BarChart3 },
  { nameKey: "web.provider.sidebar.items.bookings", descriptionKey: "web.layout.providerNav.bookingsDesc", href: "/provider/bookings", icon: Calendar },
  { nameKey: "web.provider.sidebar.items.packages", descriptionKey: "web.layout.providerNav.packagesDesc", href: "/provider/packages", icon: Package },
  { nameKey: "web.provider.sidebar.items.reviews", descriptionKey: "web.layout.providerNav.reviewsDesc", href: "/provider/reviews", icon: Star },
  { nameKey: "web.provider.sidebar.items.waitlist", descriptionKey: "web.layout.providerNav.waitlistDesc", href: "/provider/waitlist", icon: ClipboardList },
  { nameKey: "web.provider.sidebar.items.analytics", descriptionKey: "web.layout.providerNav.analyticsDesc", href: "/provider/analytics", icon: BarChart3 },
  { nameKey: "web.provider.sidebar.items.messages", descriptionKey: "web.layout.providerNav.messagesDesc", href: "/provider/messages", icon: MessageSquare },
  { nameKey: "web.provider.sidebar.items.settings", descriptionKey: "web.layout.providerNav.settingsDesc", href: "/provider/settings", icon: Settings },
];

export default function ProviderNav() {
  const { t } = useTranslation();
  const pathname = usePathname();

  return (
    <nav className="w-64 bg-white border-e border-gray-200 min-h-screen p-4">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900">{t("web.layout.providerNav.title")}</h2>
      </div>
      <ul className="space-y-1">
        {providerNavItems.map((item) => {
          const isActive = pathname?.startsWith(item.href);
          const Icon = item.icon;
          
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors",
                  isActive
                    ? "bg-primary text-white"
                    : "text-gray-700 hover:bg-gray-100"
                )}
              >
                <Icon className="w-5 h-5" />
                <div className="flex-1">
                  <div className="font-medium">{t(item.nameKey)}</div>
                  <div className={cn(
                    "text-xs",
                    isActive ? "text-white/80" : "text-gray-500"
                  )}>
                    {t(item.descriptionKey)}
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
