"use client";

import { MapPin } from "lucide-react";
import { useProviderPortal } from "@/providers/provider-portal/ProviderPortalProvider";

/**
 * "Showing: <branch>" chip for report/dashboard/finance headers. Only renders
 * when the provider has more than one location AND a specific branch is selected,
 * so changing the global location switcher is never silent. Renders nothing for
 * the org-wide (all locations) view.
 */
export function ActiveLocationChip({ className = "" }: { className?: string }) {
  const { salons, selectedLocationId } = useProviderPortal();
  if (!selectedLocationId || (salons?.length ?? 0) <= 1) return null;
  const active = salons.find((s) => s.id === selectedLocationId);
  if (!active) return null;
  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-600 ${className}`}
    >
      <MapPin className="h-3.5 w-3.5" />
      Showing: {active.name}
    </div>
  );
}
