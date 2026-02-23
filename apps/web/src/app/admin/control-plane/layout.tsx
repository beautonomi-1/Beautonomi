"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  ToggleLeft,
  Plug,
  Music,
  Sparkles,
  FileText,
  ListChecks,
  BarChart3,
  Megaphone,
  TrendingUp,
  MapPin,
  ShieldAlert,
} from "lucide-react";

const controlPlaneNav = [
  { title: "Overview", href: "/admin/control-plane/overview", icon: LayoutDashboard },
  { title: "Feature Flags", href: "/admin/control-plane/feature-flags", icon: ToggleLeft },
  { title: "Integrations", href: "/admin/control-plane/integrations", icon: Plug },
  { title: "On-Demand Module", href: "/admin/control-plane/modules/on-demand", icon: Music },
  { title: "AI Module", href: "/admin/control-plane/modules/ai", icon: Sparkles },
  { title: "AI Templates", href: "/admin/control-plane/modules/ai/templates", icon: FileText },
  { title: "AI Usage", href: "/admin/control-plane/modules/ai/usage", icon: BarChart3 },
  { title: "AI Entitlements", href: "/admin/control-plane/modules/ai/entitlements", icon: ListChecks },
  { title: "Ads Module", href: "/admin/control-plane/modules/ads", icon: Megaphone },
  { title: "Ranking Module", href: "/admin/control-plane/modules/ranking", icon: TrendingUp },
  { title: "Distance Module", href: "/admin/control-plane/modules/distance", icon: MapPin },
  { title: "Safety Module", href: "/admin/control-plane/modules/safety", icon: ShieldAlert },
  { title: "Safety Logs", href: "/admin/control-plane/safety-logs", icon: ShieldAlert },
  { title: "Audit Log", href: "/admin/control-plane/audit-log", icon: ListChecks },
];

export default function ControlPlaneLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="space-y-6">
      <nav className="flex gap-2 flex-wrap border-b pb-2">
        {controlPlaneNav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              pathname === item.href
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted"
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.title}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
