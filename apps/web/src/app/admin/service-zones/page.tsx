"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { Globe2 } from "lucide-react";
import Link from "next/link";
import MarketSidebar from "./components/MarketSidebar";
import MarketMap from "./components/MarketMap";
import MarketBuilder from "./components/MarketBuilder";
import MobileTabBar, { type MobileTab } from "./components/MobileTabBar";
import { formatFetchError } from "./lib/format-fetch-error";
import type { PlatformMarketListItem, PlatformMarketDetail, MarketOpsMetadata } from "./lib/platform-types";

/** @deprecated Use PlatformMarketListItem */
export type ZoneListItem = PlatformMarketListItem;
/** @deprecated Use PlatformMarketDetail */
export type ZoneDetail = PlatformMarketDetail;
export type { MarketOpsMetadata };

export default function MarketCoverageControlPlanePage() {
  const [markets, setMarkets] = useState<PlatformMarketListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [marketDetail, setMarketDetail] = useState<PlatformMarketDetail | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [mapJump, setMapJump] = useState<{ lng: number; lat: number; nonce: number } | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>("list");
  const didInitialSelect = useRef(false);

  const loadMarkets = useCallback(async () => {
    try {
      setListLoading(true);
      const url = includeArchived
        ? "/api/admin/service-zones?include_archived=1"
        : "/api/admin/service-zones";
      const res = await fetcher.get<{ data: PlatformMarketListItem[] }>(url);
      setMarkets(res.data ?? []);
    } catch (e) {
      console.error(e);
      toast.error(formatFetchError(e, "Failed to load markets"));
    } finally {
      setListLoading(false);
    }
  }, [includeArchived]);

  useEffect(() => {
    void loadMarkets();
  }, [loadMarkets]);

  useEffect(() => {
    if (listLoading || markets.length === 0) return;
    if (selectedId == null && !didInitialSelect.current) {
      setSelectedId(markets[0].id);
      didInitialSelect.current = true;
      return;
    }
    if (selectedId && !markets.some((z) => z.id === selectedId)) {
      setSelectedId(markets[0]?.id ?? null);
    }
  }, [listLoading, markets, selectedId]);

  const loadMarketDetail = useCallback(async (id: string) => {
    try {
      setDetailLoading(true);
      const res = await fetcher.get<{ data: PlatformMarketDetail }>(`/api/admin/service-zones/${id}`);
      setMarketDetail(res.data ?? null);
    } catch (e) {
      console.error(e);
      toast.error(formatFetchError(e, "Failed to load market"));
      setMarketDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) void loadMarketDetail(selectedId);
    else setMarketDetail(null);
  }, [selectedId, loadMarketDetail]);

  const handleMarketUpdated = useCallback(() => {
    if (selectedId) void loadMarketDetail(selectedId);
    void loadMarkets();
  }, [selectedId, loadMarketDetail, loadMarkets]);

  const handleMapFlyTo = useCallback((lng: number, lat: number) => {
    setMapJump({ lng, lat, nonce: Date.now() });
  }, []);

  /** When the user selects a market from the sidebar on mobile, jump to the map tab */
  const handleMobileSelect = useCallback((id: string) => {
    setSelectedId(id);
    setMobileTab("map");
  }, []);

  return (
    <RoleGuard allowedRoles={["superadmin"]} redirectTo="/admin/dashboard">
      {/*
       * Negative margins cancel AdminShell's p-4/p-6 padding on all sides so the
       * three-panel layout truly fills the viewport below the sticky topbar.
       * AdminShell topbar = 4rem (64px); p-4 adds 1rem top+bottom on mobile,
       * p-6 adds 1.5rem top+bottom on lg+.  We subtract all of it so the
       * h-[calc(...)] is accurate and there is no double-scroll.
       */}
      <div className="-mx-4 -mt-4 lg:-mx-6 lg:-mt-6 flex h-[calc(100dvh-4rem-2rem)] min-h-0 flex-col bg-slate-100 lg:h-[calc(100dvh-4rem-3rem)]">
        {/* ── Page header ── */}
        <header className="flex-none border-b border-slate-200 bg-white px-4 py-3 shadow-sm sm:px-6">
          <div className="mx-auto flex max-w-[1920px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white shadow-md ring-1 ring-slate-900/10">
                <Globe2 className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">Market Coverage</h1>
                <p className="mt-0.5 max-w-2xl text-sm leading-relaxed text-slate-700">
                  Roll out city by city. Build coverage from included areas, trim with exclusions, then launch when the
                  map looks right.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Link
                href="/admin/mapbox"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50"
              >
                Mapbox setup
              </Link>
            </div>
          </div>
        </header>

        {/* ── Body — unified single-panel layout across all breakpoints ── */}
        <div className="flex min-h-0 flex-1 flex-col">
          {/*
           * Markets list panel
           */}
          <aside
            className={[
              "min-h-0 w-full flex-col border-slate-200 bg-white",
              mobileTab === "list" ? "flex flex-1" : "hidden",
            ].join(" ")}
          >
            <MarketSidebar
              markets={markets}
              selectedId={selectedId}
              loading={listLoading}
              includeArchived={includeArchived}
              onIncludeArchivedChange={setIncludeArchived}
              onSelect={(id) => {
                setSelectedId(id);
                // Unified flow on all devices: selecting a market opens the map tab
                setMobileTab("map");
              }}
              onCreateIntent={() => setSelectedId(null)}
              onMarketCreated={(id) => {
                void loadMarkets();
                setSelectedId(id);
                setMobileTab("builder");
              }}
              onRefresh={() => void loadMarkets()}
            />
          </aside>

          {/* Map panel */}
          <div
            className={[
              "min-h-0 flex-col p-3 sm:p-4",
              mobileTab === "map" ? "flex flex-1" : "hidden",
            ].join(" ")}
          >
            <MarketMap
              markets={markets}
              market={marketDetail}
              loading={detailLoading}
              className="h-full min-h-[320px] flex-1"
              onCoverageUpdated={handleMarketUpdated}
              allowEdits={marketDetail?.status !== "archived"}
              mapJump={mapJump}
              onMarketSelect={handleMobileSelect}
            />
          </div>

          {/* Builder panel */}
          <div
            className={[
              "min-h-0 w-full flex-col border-slate-200 bg-white",
              mobileTab === "builder" ? "flex flex-1" : "hidden",
            ].join(" ")}
          >
            <MarketBuilder
              market={marketDetail}
              loading={detailLoading}
              onUpdated={handleMarketUpdated}
              onMapFlyTo={handleMapFlyTo}
            />
          </div>
        </div>

        {/* ── Bottom tab bar on all breakpoints (desktop mirrors tablet/mobile UX) ── */}
        <MobileTabBar activeTab={mobileTab} onChange={setMobileTab} />
      </div>
    </RoleGuard>
  );
}
