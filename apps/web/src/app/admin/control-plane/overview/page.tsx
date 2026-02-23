"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleLeft, Plug, Music, Sparkles, ListChecks, Megaphone, TrendingUp, MapPin } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import RoleGuard from "@/components/auth/RoleGuard";

const links = [
  { title: "Feature Flags", href: "/admin/control-plane/feature-flags", icon: ToggleLeft, description: "Rollouts, platforms, roles, min version" },
  { title: "Integrations", href: "/admin/control-plane/integrations", icon: Plug, description: "Amplitude, OneSignal, Mapbox, Sumsub, Aura, Gemini" },
  { title: "On-Demand Module", href: "/admin/control-plane/modules/on-demand", icon: Music, description: "Ringtone, waiting screen, UI copy" },
  { title: "AI Module", href: "/admin/control-plane/modules/ai", icon: Sparkles, description: "Budgets, templates, usage, entitlements" },
  { title: "Ads Module", href: "/admin/control-plane/modules/ads", icon: Megaphone, description: "Boosted listings, sponsored slots" },
  { title: "Ranking Module", href: "/admin/control-plane/modules/ranking", icon: TrendingUp, description: "Quality scoring, discoverability" },
  { title: "Distance Module", href: "/admin/control-plane/modules/distance", icon: MapPin, description: "Radius filter, service area" },
  { title: "Safety Module", href: "/admin/control-plane/modules/safety", icon: ShieldAlert, description: "Panic, check-in, Aura escalation" },
  { title: "Audit Log", href: "/admin/control-plane/audit-log", icon: ListChecks, description: "Config change history" },
];

export default function ControlPlaneOverviewPage() {
  const [environment, setEnvironment] = useState<string>("production");

  return (
    <RoleGuard allowedRoles={["superadmin"]} redirectTo="/admin/dashboard">
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Control Plane</h1>
        <p className="text-muted-foreground">
          Manage feature flags, integrations, and module configs. All changes are environment-scoped and audited.
        </p>
      </div>

      <div className="flex items-center gap-4">
        <span className="text-sm font-medium">Environment:</span>
        <Select value={environment} onValueChange={setEnvironment}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="development">Development</SelectItem>
            <SelectItem value="staging">Staging</SelectItem>
            <SelectItem value="production">Production</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          Use the selector on each page to change environment for edits.
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {links.map((item) => (
          <Link key={item.href} href={item.href}>
            <Card className="h-full transition-colors hover:bg-muted/50">
              <CardHeader className="flex flex-row items-center gap-2">
                <item.icon className="h-5 w-5" />
                <CardTitle className="text-base">{item.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>{item.description}</CardDescription>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
    </RoleGuard>
  );
}
