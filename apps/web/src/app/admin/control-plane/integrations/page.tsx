"use client";

import React from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart3, Map, Shield, Sparkles, UserCheck } from "lucide-react";
import RoleGuard from "@/components/auth/RoleGuard";

const integrations = [
  { name: "Amplitude", href: "/admin/integrations/amplitude", icon: BarChart3, description: "Analytics, guides, surveys" },
  { name: "OneSignal & Mapbox", href: "/admin/settings", icon: Map, description: "Push (OneSignal), maps (Mapbox) via Platform Settings" },
  { name: "Gemini AI", href: "/admin/control-plane/integrations/gemini", icon: Sparkles, description: "API key, models, safety (Control Plane)" },
  { name: "Sumsub", href: "/admin/control-plane/integrations/sumsub", icon: Shield, description: "KYC verification (Control Plane)" },
  { name: "Aura", href: "/admin/control-plane/integrations/aura", icon: UserCheck, description: "Identity/trust (Control Plane)" },
];

export default function ControlPlaneIntegrationsPage() {
  return (
    <RoleGuard allowedRoles={["superadmin"]} redirectTo="/admin/dashboard">
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Integrations</h1>
        <p className="text-muted-foreground">
          Manage API keys and integration toggles. Secrets are never shown after save.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {integrations.map((item) => (
          <Link key={item.name} href={item.href}>
            <Card className="h-full transition-colors hover:bg-muted/50">
              <CardHeader className="flex flex-row items-center gap-2">
                <item.icon className="h-5 w-5" />
                <CardTitle className="text-base">{item.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>{item.description}</CardDescription>
                <Button variant="link" className="p-0 mt-2">Configure →</Button>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
    </RoleGuard>
  );
}
