"use client";

/**
 * Zone management has moved to Operations → Market Coverage (/admin/service-zones).
 * This file is kept so the import in mapbox/page.tsx continues to compile, but the
 * legacy Create/Edit zone form is no longer rendered — it used flat array fields
 * (postal_codes[], cities[], polygon_coordinates) that are not read by the PostGIS
 * coverage checks.  All zone work should go through the new control plane.
 */

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { fetcher } from "@/lib/http/fetcher";
import { Globe2, ArrowRight, AlertTriangle, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface LegacyZone {
  id: string;
  name: string;
  zone_type: string;
  is_active: boolean;
  status?: string;
}

export default function ServiceZonesTab() {
  const [legacyZones, setLegacyZones] = useState<LegacyZone[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch zones that use the old flat-field approach (have zone_type but no inclusions).
    fetcher
      .get<{ data: LegacyZone[] }>("/api/admin/mapbox/service-zones")
      .then((res) => setLegacyZones(res.data ?? []))
      .catch(() => setLegacyZones([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      {/* Deprecation banner */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-amber-900">
              Legacy zone format — use Market Coverage instead
            </p>
            <p className="mt-1 text-sm leading-relaxed text-amber-800">
              These zones use flat field arrays (<code className="rounded bg-amber-100 px-1 text-xs">postal_codes[]</code>,{" "}
              <code className="rounded bg-amber-100 px-1 text-xs">cities[]</code>,{" "}
              <code className="rounded bg-amber-100 px-1 text-xs">polygon_coordinates</code>) that are{" "}
              <strong>not read by the PostGIS coverage checks</strong>. All new zone work — city by
              city rollout, dataset-backed inclusions, Mapbox map preview, and provider
              auto-enrollment — should go through{" "}
              <strong>Operations → Market Coverage</strong>.
            </p>
            <div className="mt-3">
              <Button asChild size="sm" className="gap-1.5">
                <Link href="/admin/service-zones">
                  <Globe2 className="h-4 w-4" />
                  Go to Market Coverage
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* How the two systems relate */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <MapPin className="h-4 w-4 text-amber-500" />
            <span className="text-xs font-bold uppercase tracking-wide text-slate-600">
              Legacy zones (here)
            </span>
            <Badge variant="outline" className="border-amber-300 text-amber-700 text-[10px]">
              Deprecated
            </Badge>
          </div>
          <ul className="space-y-1 text-xs text-slate-600">
            <li>• Stored as <code className="text-slate-800">postal_codes[]</code> / <code className="text-slate-800">cities[]</code> arrays</li>
            <li>• No map preview or PostGIS geometry</li>
            <li>• Only matched via JS string comparison at booking time</li>
            <li>• Not read when active <code className="text-slate-800">platform_zones</code> with geometry exist</li>
          </ul>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <Globe2 className="h-4 w-4 text-emerald-600" />
            <span className="text-xs font-bold uppercase tracking-wide text-slate-600">
              Market Coverage
            </span>
            <Badge className="bg-emerald-600 text-[10px]">
              Active
            </Badge>
          </div>
          <ul className="space-y-1 text-xs text-slate-600">
            <li>• PostGIS geometry built from postal dataset inclusions</li>
            <li>• Interactive Mapbox map with layer toggles</li>
            <li>• Draft → active → archived lifecycle with versioning</li>
            <li>• Providers auto-enrolled on zone publish</li>
          </ul>
        </div>
      </div>

      {/* Read-only list of any existing legacy zones */}
      {!loading && legacyZones.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-800">
              Existing legacy zones ({legacyZones.length})
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              These are read-only. Recreate them in Market Coverage to enable PostGIS checks and
              map preview.
            </p>
          </div>
          <ul className="divide-y divide-slate-100">
            {legacyZones.map((z) => (
              <li key={z.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{z.name}</p>
                  <p className="text-xs text-slate-500">{z.zone_type}</p>
                </div>
                <Badge
                  variant="outline"
                  className={
                    z.is_active
                      ? "border-emerald-300 text-emerald-700"
                      : "border-slate-300 text-slate-500"
                  }
                >
                  {z.is_active ? "Active" : "Inactive"}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!loading && legacyZones.length === 0 && (
        <p className="text-center text-sm text-slate-500">No legacy zones found.</p>
      )}
    </div>
  );
}
