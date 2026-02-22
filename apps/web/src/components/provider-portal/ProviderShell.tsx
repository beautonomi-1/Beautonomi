"use client";

import React from "react";
import { ProviderSidebar } from "./ProviderSidebar";
import { ProviderTopbar } from "./ProviderTopbar";
import { useProviderPortal } from "@/providers/provider-portal/ProviderPortalProvider";
import { cn } from "@/lib/utils";

export function ProviderShell({ children }: { children: React.ReactNode }) {
  const { sidebarCollapsed } = useProviderPortal();

  return (
    <div className="min-h-screen bg-gray-50 overflow-x-hidden">
      <ProviderSidebar />
      <div
        className={cn(
          // Use left padding (not margin) to reserve space for the fixed sidebar and avoid right overflow.
          "transition-all duration-300 w-full max-w-full min-w-0 overflow-x-hidden box-border",
          sidebarCollapsed ? "md:pl-16" : "md:pl-64"
        )}
      >
        <ProviderTopbar />
        <main className="p-4 md:p-6 max-w-7xl mx-auto w-full min-w-0 overflow-x-hidden box-border">
          {children}
        </main>
      </div>
    </div>
  );
}
