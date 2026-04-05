"use client";

import React, { useState } from "react";
import Link from "next/link";
import RoleGuard from "@/components/auth/RoleGuard";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Settings, Layers, MapPin, Route, Globe2 } from "lucide-react";
import MapboxConfigTab from "./components/MapboxConfigTab";
import ServiceZonesTab from "./components/ServiceZonesTab";

export default function AdminMapbox() {
  const [activeTab, setActiveTab] = useState<"config" | "zones">("config");

  return (
    <RoleGuard allowedRoles={["superadmin"]} redirectTo="/admin/dashboard">
      <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50/80">
        <div className="container mx-auto max-w-6xl px-4 py-8 sm:py-10">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm sm:p-8 mb-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-3 max-w-2xl">
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                  Integrations
                </p>
                <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                  Mapbox
                </h1>
                <p className="text-slate-600 leading-relaxed">
                  Connect Mapbox for address search, distance logic, and interactive maps across the web app,
                  provider portal, and mobile apps. Secrets stay on the server; only the public token is sent to
                  browsers.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                    <MapPin className="h-3.5 w-3.5 text-primary" aria-hidden />
                    Geocoding & search
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                    <Route className="h-3.5 w-3.5 text-primary" aria-hidden />
                    Routes & zones
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                    <Globe2 className="h-3.5 w-3.5 text-primary" aria-hidden />
                    Client maps (pk. token)
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col">
                <Link
                  href="https://account.mapbox.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50"
                >
                  Mapbox account
                </Link>
                <Link
                  href="/admin/service-zones"
                  className="inline-flex items-center justify-center rounded-xl border border-transparent bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-95"
                >
                  Manage coverage markets
                </Link>
              </div>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "config" | "zones")} className="space-y-6">
            <TabsList className="grid h-auto w-full max-w-md grid-cols-2 gap-1 rounded-xl bg-slate-100/90 p-1 sm:inline-flex sm:w-auto">
              <TabsTrigger
                value="config"
                className="rounded-lg px-4 py-2.5 text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm"
              >
                <Settings className="mr-2 h-4 w-4 shrink-0" />
                Keys & maps
              </TabsTrigger>
              <TabsTrigger
                value="zones"
                className="rounded-lg px-4 py-2.5 text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm"
              >
                <Layers className="mr-2 h-4 w-4 shrink-0" />
                Legacy zones
                <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                  deprecated
                </span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="config" className="mt-0 focus-visible:outline-none">
              <MapboxConfigTab />
            </TabsContent>

            <TabsContent value="zones" className="mt-0 focus-visible:outline-none">
              <ServiceZonesTab />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </RoleGuard>
  );
}
