"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { fetcher } from "@/lib/http/fetcher";
import { Activity, Settings, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const POLL_INTERVAL_MS = 10000;
const DEFAULT_CENTER: [number, number] = [28.0473, -26.2041];
const DEFAULT_ZOOM = 6;
const FUZZ_METERS = 0.002; // ~200m approx

function fuzzCoord(c: number, meters: number): number {
  const delta = (meters / 111320) * (Math.random() - 0.5) * 2;
  return Number((c + delta).toFixed(5));
}

interface MapState {
  providers: Array<{
    provider_id: string;
    name: string;
    last_lat: number | null;
    last_lng: number | null;
    last_at: string | null;
    status: string;
    active_booking_id: string | null;
  }>;
  at_home_bookings: Array<{
    booking_id: string;
    provider_id: string;
    customer_target_lat: number | null;
    customer_target_lng: number | null;
    status: string;
    arrived_at_target: boolean;
    arrived_at: string | null;
    arrived_distance_m: number | null;
    provider_last_lat: number | null;
    provider_last_lng: number | null;
  }>;
  at_salon_bookings: Array<{
    booking_id: string;
    provider_id: string;
    salon_lat: number;
    salon_lng: number;
    salon_name?: string;
    status: string;
  }>;
  summary: {
    active_providers: number;
    active_at_home: number;
    at_salon: number;
    en_route: number;
    arrived: number;
  };
}

export default function LiveMapTab() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapState, setMapState] = useState<MapState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [privacyMode, setPrivacyMode] = useState(true);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [drawerBooking, setDrawerBooking] = useState<{
    type: "at_home" | "at_salon";
    booking: MapState["at_home_bookings"][0] | MapState["at_salon_bookings"][0];
    track?: { arrived_at?: string; arrived_distance_m?: number; location_events?: unknown[] };
  } | null>(null);
  const [config, setConfig] = useState<{
    tracking_arrival_radius_meters: number;
    retention_days_raw_pings: number;
  } | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [configForm, setConfigForm] = useState({ arrivalRadius: 100, retentionDays: 30 });
  const token = typeof window !== "undefined" ? process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN : undefined;

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetcher.get<{ data: { tracking_arrival_radius_meters: number; retention_days_raw_pings: number } }>(
        "/api/admin/gods-eye/config"
      );
      const c = res.data;
      if (c) {
        setConfig(c);
        setConfigForm({
          arrivalRadius: c.tracking_arrival_radius_meters ?? 100,
          retentionDays: c.retention_days_raw_pings ?? 30,
        });
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const loadMapState = useCallback(async () => {
    try {
      const res = await fetcher.get<{ data: MapState }>("/api/admin/gods-eye/map-state");
      setMapState(res.data ?? null);
      setError(null);
    } catch (e) {
      console.error(e);
      setError("Failed to load map state");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMapState();
    const t = setInterval(loadMapState, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [loadMapState]);

  useEffect(() => {
    const auditView = async () => {
      try {
        await fetcher.post("/api/admin/gods-eye/audit", { action: "view_map", meta: { tab: "live_map" } });
      } catch {
        // ignore
      }
    };
    auditView();
  }, []);

  useEffect(() => {
    if (!token || !containerRef.current) return;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      accessToken: token,
      style: "mapbox://styles/mapbox/streets-v12",
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
    });
    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    map.on("load", () => setMapReady(true));
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [token]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !mapState) return;

    const applyFuzz = (lat: number, lng: number) =>
      privacyMode && !selectedBookingId
        ? [fuzzCoord(lat, 200), fuzzCoord(lng, 200)]
        : [lat, lng];

    const providerPoints: GeoJSON.Feature<GeoJSON.Point>[] = mapState.providers
      .filter((p) => p.last_lat != null && p.last_lng != null)
      .map((p) => {
        const [lng, lat] = applyFuzz(p.last_lat!, p.last_lng!);
        return {
          type: "Feature" as const,
          properties: { id: p.provider_id, name: p.name, status: p.status, active_booking_id: p.active_booking_id },
          geometry: { type: "Point" as const, coordinates: [lng, lat] },
        };
      });

    const atHomeTargets: GeoJSON.Feature<GeoJSON.Point>[] = mapState.at_home_bookings
      .filter((b) => b.customer_target_lat != null && b.customer_target_lng != null)
      .map((b) => {
        const [lng, lat] = applyFuzz(b.customer_target_lat!, b.customer_target_lng!);
        return {
          type: "Feature" as const,
          properties: { booking_id: b.booking_id, arrived: b.arrived_at_target },
          geometry: { type: "Point" as const, coordinates: [lng, lat] },
        };
      });

    const salonPoints: GeoJSON.Feature<GeoJSON.Point>[] = mapState.at_salon_bookings.map((b) => {
      const [lng, lat] = applyFuzz(b.salon_lat, b.salon_lng);
      return {
        type: "Feature" as const,
        properties: { booking_id: b.booking_id, name: b.salon_name },
        geometry: { type: "Point" as const, coordinates: [lng, lat] },
      };
    });

    const lineFeatures: GeoJSON.Feature<GeoJSON.LineString>[] = mapState.at_home_bookings
      .filter(
        (b) =>
          b.provider_last_lat != null &&
          b.provider_last_lng != null &&
          b.customer_target_lat != null &&
          b.customer_target_lng != null
      )
      .map((b) => {
        const [fromLng, fromLat] = applyFuzz(b.provider_last_lat!, b.provider_last_lng!);
        const [toLng, toLat] = applyFuzz(b.customer_target_lat!, b.customer_target_lng!);
        return {
          type: "Feature" as const,
          properties: { booking_id: b.booking_id, arrived: b.arrived_at_target },
          geometry: {
            type: "LineString" as const,
            coordinates: [[fromLng, fromLat], [toLng, toLat]],
          },
        };
      });

    const sources: [string, GeoJSON.FeatureCollection][] = [
      ["providers", { type: "FeatureCollection", features: providerPoints }],
      ["at-home-targets", { type: "FeatureCollection", features: atHomeTargets }],
      ["salons", { type: "FeatureCollection", features: salonPoints }],
      ["lines", { type: "FeatureCollection", features: lineFeatures }],
    ];

    const removeLayer = (id: string) => {
      if (map.getLayer(id)) map.removeLayer(id);
    };
    const removeSource = (id: string) => {
      if (map.getSource(id)) map.removeSource(id);
    };

    sources.forEach(([id, data]) => {
      if (map.getSource(id)) (map.getSource(id) as mapboxgl.GeoJSONSource).setData(data);
      else map.addSource(id, { type: "geojson", data });
    });

    if (!map.getLayer("lines-layer")) {
      map.addLayer({
        id: "lines-layer",
        type: "line",
        source: "lines",
        paint: {
          "line-color": ["case", ["get", "arrived"], "#22c55e", "#3b82f6"],
          "line-width": 2,
        },
      });
    }
    if (!map.getLayer("providers-layer")) {
      map.addLayer({
        id: "providers-layer",
        type: "circle",
        source: "providers",
        paint: { "circle-color": "#3b82f6", "circle-radius": 10, "circle-stroke-width": 2, "circle-stroke-color": "#fff" },
      });
    }
    if (!map.getLayer("targets-layer")) {
      map.addLayer({
        id: "targets-layer",
        type: "circle",
        source: "at-home-targets",
        paint: { "circle-color": "#6b7280", "circle-radius": 8, "circle-stroke-width": 2, "circle-stroke-color": "#fff" },
      });
    }
    if (!map.getLayer("salons-layer")) {
      map.addLayer({
        id: "salons-layer",
        type: "circle",
        source: "salons",
        paint: { "circle-color": "#a855f7", "circle-radius": 10, "circle-stroke-width": 2, "circle-stroke-color": "#fff" },
      });
    }

    const onClick = (e: mapboxgl.MapMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point);
      let bookingId: string | null = null;
      const fWithBooking = features.find((x) => x.properties?.booking_id);
      if (fWithBooking?.properties?.booking_id) bookingId = String(fWithBooking.properties.booking_id);
      const fProvider = features.find((x) => x.properties?.active_booking_id);
      if (!bookingId && fProvider?.properties?.active_booking_id)
        bookingId = String(fProvider.properties.active_booking_id);
      if (bookingId) {
        setSelectedBookingId(bookingId);
        const atHome = mapState.at_home_bookings.find((b) => b.booking_id === bookingId);
        const atSalon = mapState.at_salon_bookings.find((b) => b.booking_id === bookingId);
        if (atHome) setDrawerBooking({ type: "at_home", booking: atHome });
        else if (atSalon) setDrawerBooking({ type: "at_salon", booking: atSalon });
      }
    };
    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
    };
  }, [mapReady, mapState, privacyMode, selectedBookingId]);

  const openBookingTrack = async (bookingId: string) => {
    try {
      await fetcher.post("/api/admin/gods-eye/audit", { action: "open_booking", booking_id: bookingId });
      const res = await fetcher.get<{
        data: { tracking_state: Record<string, unknown> | null; location_events: unknown[] };
      }>(`/api/admin/gods-eye/booking/${bookingId}/track`);
      const state = res.data?.tracking_state;
      const events = res.data?.location_events ?? [];
      if (drawerBooking) {
        setDrawerBooking({
          ...drawerBooking,
          track: {
            arrived_at: state?.arrived_at as string | undefined,
            arrived_distance_m: state?.arrived_distance_m as number | undefined,
            location_events: events,
          },
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const exportEvidence = async (bookingId: string) => {
    try {
      const res = await fetcher.get<{
        data: {
          booking_id: string;
          tracking_state: Record<string, unknown> | null;
          location_events: unknown[];
          route_line?: { from: { lat: number; lng: number }; to: { lat: number; lng: number } } | null;
        };
      }>(`/api/admin/gods-eye/booking/${bookingId}/track`);
      await fetcher.post("/api/admin/gods-eye/audit", {
        action: "export",
        booking_id: bookingId,
        meta: { exported_at: new Date().toISOString() },
      });
      const payload = {
        booking_id: res.data?.booking_id ?? bookingId,
        exported_at_iso: new Date().toISOString(),
        tracking_state: res.data?.tracking_state ?? null,
        location_events: res.data?.location_events ?? [],
        route_line: res.data?.route_line ?? null,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gods-eye-evidence-${bookingId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    }
  };

  if (!token) {
    return (
      <div className="rounded-lg border bg-gray-50 p-8 text-center text-gray-600">
        Set NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN to enable the Live Map.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)]">
      <div className="flex items-center gap-4 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-sm font-medium">Live</span>
        </div>
        <Select
          value={privacyMode ? "privacy_on" : "privacy_off"}
          onValueChange={(v) => setPrivacyMode(v === "privacy_on")}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Privacy" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="privacy_on">Privacy mode (fuzz)</SelectItem>
            <SelectItem value="privacy_off">Exact coordinates</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => loadMapState()}>
          Refresh
        </Button>
      </div>

      <div className="flex flex-1 min-h-0 gap-4">
        <div className="w-56 flex-shrink-0 space-y-2">
          <div className="rounded-lg border bg-white p-3">
            <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Summary</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Active providers</span>
                <span className="font-medium">{mapState?.summary?.active_providers ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span>At-home</span>
                <span className="font-medium">{mapState?.summary?.active_at_home ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span>En route</span>
                <span className="font-medium">{mapState?.summary?.en_route ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span>Arrived</span>
                <span className="font-medium">{mapState?.summary?.arrived ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span>At salon</span>
                <span className="font-medium">{mapState?.summary?.at_salon ?? 0}</span>
              </div>
            </div>
          </div>
          {config && (
            <div className="rounded-lg border bg-white p-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold text-gray-500 uppercase">Tracking config</h4>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setConfigForm({ arrivalRadius: config.tracking_arrival_radius_meters, retentionDays: config.retention_days_raw_pings }); setConfigOpen(true); }}>
                  <Settings className="w-3.5 h-3.5" />
                </Button>
              </div>
              <p className="text-xs text-gray-600">Arrival: {config.tracking_arrival_radius_meters}m · Retention: {config.retention_days_raw_pings} days</p>
            </div>
          )}
          <p className="text-xs text-gray-400">Polling every 10s. Blue = provider, gray = customer target, purple = salon.</p>
        </div>

        <Dialog open={configOpen} onOpenChange={setConfigOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Tracking config</DialogTitle>
              <DialogDescription>Arrival radius and retention for location pings. Run retention purge via API or cron.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div>
                <Label htmlFor="arrival-radius">Arrival radius (m)</Label>
                <Input
                  id="arrival-radius"
                  type="number"
                  min={20}
                  max={500}
                  value={configForm.arrivalRadius}
                  onChange={(e) => setConfigForm((f) => ({ ...f, arrivalRadius: Number(e.target.value) || 100 }))}
                />
              </div>
              <div>
                <Label htmlFor="retention-days">Retention (days)</Label>
                <Input
                  id="retention-days"
                  type="number"
                  min={1}
                  max={365}
                  value={configForm.retentionDays}
                  onChange={(e) => setConfigForm((f) => ({ ...f, retentionDays: Number(e.target.value) || 30 }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfigOpen(false)}>Cancel</Button>
              <Button
                disabled={configSaving}
                onClick={async () => {
                  setConfigSaving(true);
                  try {
                    await fetcher.patch("/api/admin/gods-eye/config", {
                      tracking_arrival_radius_meters: configForm.arrivalRadius,
                      retention_days_raw_pings: configForm.retentionDays,
                    });
                    await loadConfig();
                    setConfigOpen(false);
                  } finally {
                    setConfigSaving(false);
                  }
                }}
              >
                {configSaving ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="flex-1 min-w-0 relative rounded-lg border overflow-hidden">
          <div ref={containerRef} className="absolute inset-0" />
          {loading && !mapState && (
            <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
              <Activity className="w-8 h-8 animate-spin text-gray-400" />
            </div>
          )}
        </div>

        {drawerBooking && (
          <div className="w-80 flex-shrink-0 rounded-lg border bg-white overflow-y-auto">
            <div className="p-3 border-b flex justify-between items-center">
              <span className="font-medium">Booking</span>
              <Button variant="ghost" size="sm" onClick={() => { setDrawerBooking(null); setSelectedBookingId(null); }}>
                Close
              </Button>
            </div>
            <div className="p-3 space-y-2 text-sm">
              <p><strong>ID:</strong> {(drawerBooking.booking as any).booking_id}</p>
              <p><strong>Type:</strong> {drawerBooking.type === "at_home" ? "At home" : "At salon"}</p>
              <p><strong>Status:</strong> {(drawerBooking.booking as any).status}</p>
              {drawerBooking.type === "at_home" && (
                <>
                  <p>Arrived: {(drawerBooking.booking as any).arrived_at_target ? "Yes" : "No"}</p>
                  {(drawerBooking.booking as any).arrived_at && (
                    <p>Arrived at: {new Date((drawerBooking.booking as any).arrived_at).toLocaleString()}</p>
                  )}
                  {(drawerBooking.booking as any).arrived_distance_m != null && (
                    <p>Distance at arrival: {(drawerBooking.booking as any).arrived_distance_m.toFixed(0)} m</p>
                  )}
                </>
              )}
              <div className="flex gap-2">
                <Button size="sm" className="flex-1" onClick={() => openBookingTrack((drawerBooking.booking as any).booking_id)}>
                  Load track & evidence
                </Button>
                <Button size="sm" variant="outline" onClick={() => exportEvidence((drawerBooking.booking as any).booking_id)} title="Download JSON for disputes">
                  <Download className="w-4 h-4" />
                </Button>
              </div>
              {drawerBooking.track && (
                <div className="pt-2 border-t text-xs">
                  <p>Location events: {(drawerBooking.track as any).location_events?.length ?? 0}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

