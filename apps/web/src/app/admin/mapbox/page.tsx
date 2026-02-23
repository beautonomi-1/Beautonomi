"use client";

import React, { useState } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Settings, Layers } from "lucide-react";
import MapboxConfigTab from "./components/MapboxConfigTab";
import ServiceZonesTab from "./components/ServiceZonesTab";

export default function AdminMapbox() {
  const [activeTab, setActiveTab] = useState<"config" | "zones">("config");

  return (
    <RoleGuard allowedRoles={["superadmin"]} redirectTo="/admin/dashboard">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-6">
          <h1 className="text-3xl font-semibold mb-2">Mapbox Management</h1>
          <p className="text-gray-600">Configure Mapbox API keys and manage service zones</p>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList className="mb-6">
            <TabsTrigger value="config">
              <Settings className="w-4 h-4 mr-2" />
              Configuration
            </TabsTrigger>
            <TabsTrigger value="zones">
              <Layers className="w-4 h-4 mr-2" />
              Service Zones
            </TabsTrigger>
          </TabsList>

          <TabsContent value="config">
            <MapboxConfigTab />
          </TabsContent>

          <TabsContent value="zones">
            <ServiceZonesTab />
          </TabsContent>
        </Tabs>
      </div>
    </RoleGuard>
  );
}
