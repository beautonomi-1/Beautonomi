"use client";

import React, { useState, useEffect, useCallback } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { fetcher } from "@/lib/http/fetcher";
import { FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { Layers, Plus } from "lucide-react";
import Link from "next/link";
import ZoneList from "./components/ZoneList";
import ZoneMap from "./components/ZoneMap";
import BuilderPanel from "./components/BuilderPanel";

export interface ZoneListItem {
  id: string;
  name: string;
  country_code: string;
  status: string;
  version: number;
  bbox: number[] | { minLng: number; minLat: number; maxLng: number; maxLat: number } | null;
  created_at: string;
  updated_at: string;
  has_geometry: boolean;
}

export interface ZoneDetail {
  id: string;
  name: string;
  country_code: string;
  status: string;
  version: number;
  bbox: number[] | { minLng: number; minLat: number; maxLng: number; maxLat: number } | null;
  centroid: unknown;
  created_at: string;
  updated_at: string;
  inclusions: { id: string; type: string; ref_code: string; ref_name: string | null; created_at: string }[];
  exclusions: { id: string; type: string; ref_code: string | null; ref_name: string | null; created_at: string }[];
  geometry_geojson: { type: string; coordinates: unknown } | null;
  fragment_count?: number;
  disconnected_fragments?: boolean;
}

function formatFetchError(e: unknown, fallback: string): string {
  if (!(e instanceof FetchError)) return e instanceof Error ? e.message : fallback;
  const msg = e.message;
  if (!e.details) return msg;
  const details = Array.isArray(e.details)
    ? (e.details as Array<{ path?: string; message?: string }>)
        .map((d) => (d.path ? `${d.path}: ${d.message ?? ""}` : String(d.message ?? d)))
        .join("; ")
    : String(e.details);
  return details ? `${msg}: ${details}` : msg;
}

export default function ServiceZonesControlPlanePage() {
  const [zones, setZones] = useState<ZoneListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoneDetail, setZoneDetail] = useState<ZoneDetail | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadZones = useCallback(async () => {
    try {
      setListLoading(true);
      const res = await fetcher.get<{ data: ZoneListItem[] }>("/api/admin/service-zones");
      setZones(res.data ?? []);
      if (!selectedId && (res.data?.length ?? 0) > 0 && !zoneDetail) {
        setSelectedId(res.data![0].id);
      }
    } catch (e) {
      console.error(e);
      toast.error(formatFetchError(e, "Failed to load zones"));
    } finally {
      setListLoading(false);
    }
  }, [selectedId, zoneDetail]);

  useEffect(() => {
    loadZones();
  }, []);

  const loadZoneDetail = useCallback(async (id: string) => {
    try {
      setDetailLoading(true);
      const res = await fetcher.get<{ data: ZoneDetail }>(`/api/admin/service-zones/${id}`);
      setZoneDetail(res.data ?? null);
    } catch (e) {
      console.error(e);
      toast.error(formatFetchError(e, "Failed to load zone"));
      setZoneDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) loadZoneDetail(selectedId);
    else setZoneDetail(null);
  }, [selectedId, loadZoneDetail]);

  const handleSelectZone = (id: string) => setSelectedId(id);
  const handleCreateZone = () => {
    setSelectedId(null);
    setZoneDetail(null);
  };
  const handleZoneCreated = (id: string) => {
    loadZones();
    setSelectedId(id);
  };
  const handleZoneUpdated = () => {
    if (selectedId) loadZoneDetail(selectedId);
    loadZones();
  };

  return (
    <RoleGuard allowedRoles={["superadmin"]} redirectTo="/admin/dashboard">
      <div className="flex flex-col h-[calc(100vh-4rem)]">
        <div className="flex-none px-4 py-3 border-b bg-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-6 h-6 text-primary" />
              <div>
                <h1 className="text-xl font-semibold">Service Zones Control Plane</h1>
                <p className="text-sm text-gray-500">
                  Manage coverage by country, province, city, town, and postal codes. Publish when ready.
                </p>
              </div>
            </div>
            <Link
              href="/admin/mapbox"
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Mapbox config →
            </Link>
          </div>
        </div>

        <div className="flex-1 flex min-h-0">
          <aside className="w-72 flex-none border-r bg-white flex flex-col">
            <ZoneList
              zones={zones}
              selectedId={selectedId}
              loading={listLoading}
              onSelect={handleSelectZone}
              onCreateClick={handleCreateZone}
              onZoneCreated={handleZoneCreated}
              onRefresh={loadZones}
            />
          </aside>

          <main className="flex-1 min-w-0 flex flex-col bg-gray-50">
            <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 gap-0">
              <div className="lg:col-span-2 min-h-[320px] lg:min-h-0">
                <ZoneMap
                  zone={zoneDetail}
                  loading={detailLoading}
                  className="h-full min-h-[320px]"
                />
              </div>
              <div className="bg-white border-l flex flex-col min-h-0">
                <BuilderPanel
                  zone={zoneDetail}
                  loading={detailLoading}
                  onUpdated={handleZoneUpdated}
                  onZoneCreated={handleZoneCreated}
                />
              </div>
            </div>
          </main>
        </div>
      </div>
    </RoleGuard>
  );
}
