import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Activity } from "lucide-react";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { fetchMapboxPublicMapConfig } from "@/lib/fetchMapboxPublicMapConfig";
import { adminSpaAbsoluteUrl } from "@/lib/adminSpaPath";
import { AdminPanel } from "@/components/ui/AdminPanel";

const POLL_MS = 10_000;
const DEFAULT_CENTER: [number, number] = [28.0473, -26.2041];
const DEFAULT_ZOOM = 6;

function fuzzCoord(c: number, meters: number): number {
  const delta = (meters / 111320) * (Math.random() - 0.5) * 2;
  return Number((c + delta).toFixed(5));
}

/** GeoJSON position [lng, lat] */
function toMapPosition(lat: number, lng: number, privacyMode: boolean): [number, number] {
  if (privacyMode) {
    return [fuzzCoord(lng, 200), fuzzCoord(lat, 200)];
  }
  return [lng, lat];
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

type CustomerMarker = {
  user_id: string;
  lat: number;
  lng: number;
  display_name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  address_label: string | null;
  source: "saved_address" | "booking_address";
  last_seen_at: string | null;
};

type MapState = {
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
  customer_markers?: CustomerMarker[];
  summary: {
    active_providers: number;
    active_at_home: number;
    at_salon: number;
    en_route: number;
    arrived: number;
    customers_mapped?: number;
  };
};

export function GodsEyeLiveMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapboxToken, setMapboxToken] = useState<string | null | undefined>(undefined);
  const [mapboxStyleUrl, setMapboxStyleUrl] = useState<string | null>(null);
  const [privacyMode, setPrivacyMode] = useState(false);

  const mapDataEnabled =
    mapboxToken !== undefined && typeof mapboxToken === "string" && mapboxToken.length > 0;

  const mapQ = useQuery({
    queryKey: [...adminQueryKeys.godsEye(), "map-state"] as const,
    queryFn: () =>
      adminApi.getJson<MapState>("/api/admin/gods-eye/map-state?customer_markers_max=2500", { timeoutMs: 120_000 }),
    refetchInterval: POLL_MS,
    enabled: mapDataEnabled,
  });

  const mapState = mapQ.data ?? null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cfg = await fetchMapboxPublicMapConfig();
      if (cancelled) return;
      setMapboxToken(cfg.accessToken ?? null);
      setMapboxStyleUrl(cfg.styleUrl);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await adminApi.postJson("/api/admin/gods-eye/audit", {
          action: "view_map",
          meta: { tab: "gods_eye_spa", layer: "traction_customers" },
        });
      } catch {
        // ignore
      }
    })();
  }, []);

  useEffect(() => {
    if (mapboxToken == null || !mapboxToken || !containerRef.current) return;
    let cancelled = false;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      accessToken: mapboxToken,
      style: mapboxStyleUrl?.trim() || "mapbox://styles/mapbox/streets-v12",
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: true,
    });
    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    map.on("load", () => {
      if (cancelled) return;
      // Flex/sidebar layouts often leave the canvas at 0×0 until after paint — resize after layout.
      const bump = () => {
        try {
          map.resize();
        } catch {
          /* ignore */
        }
      };
      bump();
      requestAnimationFrame(() => {
        bump();
        requestAnimationFrame(bump);
      });
      setMapReady(true);
    });
    mapRef.current = map;

    return () => {
      cancelled = true;
      popupRef.current?.remove();
      popupRef.current = null;
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [mapboxToken, mapboxStyleUrl]);

  /** Keep the canvas sized when the shell layout (sidebar, devtools, etc.) changes. */
  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    const el = containerRef.current;
    if (!map || !el) return;

    const bump = () => {
      try {
        map.resize();
      } catch {
        /* ignore */
      }
    };
    bump();

    const ro = new ResizeObserver(() => bump());
    ro.observe(el);

    window.addEventListener("resize", bump);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", bump);
    };
  }, [mapReady]);

  const renderLayers = useCallback(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !mapState) return;
    if (!map.isStyleLoaded()) return;

    const pos = (lat: number, lng: number) => toMapPosition(lat, lng, privacyMode);

    const providerPoints = mapState.providers
      .filter((p) => p.last_lat != null && p.last_lng != null)
      .map((p) => {
        const [lng, lat] = pos(p.last_lat!, p.last_lng!);
        return {
          type: "Feature" as const,
          properties: {
            id: p.provider_id,
            name: p.name,
            status: p.status,
            active_booking_id: p.active_booking_id,
            kind: "provider",
          },
          geometry: { type: "Point" as const, coordinates: [lng, lat] },
        };
      });

    const atHomeTargets = mapState.at_home_bookings
      .filter((b) => b.customer_target_lat != null && b.customer_target_lng != null)
      .map((b) => {
        const [lng, lat] = pos(b.customer_target_lat!, b.customer_target_lng!);
        return {
          type: "Feature" as const,
          properties: { booking_id: b.booking_id, arrived: b.arrived_at_target, kind: "target" },
          geometry: { type: "Point" as const, coordinates: [lng, lat] },
        };
      });

    const salonPoints = mapState.at_salon_bookings.map((b) => {
      const [lng, lat] = pos(b.salon_lat, b.salon_lng);
      return {
        type: "Feature" as const,
        properties: { booking_id: b.booking_id, name: b.salon_name, kind: "salon" },
        geometry: { type: "Point" as const, coordinates: [lng, lat] },
      };
    });

    const customers = (mapState.customer_markers ?? []).map((c) => {
      const [lng, lat] = pos(c.lat, c.lng);
      return {
        type: "Feature" as const,
        properties: {
          kind: "customer",
          user_id: c.user_id,
          display_name: c.display_name,
          email: c.email,
          phone: c.phone,
          city: c.city,
          country: c.country,
          source: c.source,
          last_seen_at: c.last_seen_at,
        },
        geometry: { type: "Point" as const, coordinates: [lng, lat] },
      };
    });

    const lineFeatures = mapState.at_home_bookings
      .filter(
        (b) =>
          b.provider_last_lat != null &&
          b.provider_last_lng != null &&
          b.customer_target_lat != null &&
          b.customer_target_lng != null
      )
      .map((b) => {
        const [fromLng, fromLat] = pos(b.provider_last_lat!, b.provider_last_lng!);
        const [toLng, toLat] = pos(b.customer_target_lat!, b.customer_target_lng!);
        return {
          type: "Feature" as const,
          properties: { booking_id: b.booking_id, arrived: b.arrived_at_target },
          geometry: {
            type: "LineString" as const,
            coordinates: [
              [fromLng, fromLat],
              [toLng, toLat],
            ],
          },
        };
      });

    const sources: [string, GeoJSON.FeatureCollection][] = [
      ["ge-lines", { type: "FeatureCollection", features: lineFeatures }],
      ["ge-customers", { type: "FeatureCollection", features: customers }],
      ["ge-at-home-targets", { type: "FeatureCollection", features: atHomeTargets }],
      ["ge-salons", { type: "FeatureCollection", features: salonPoints }],
      ["ge-providers", { type: "FeatureCollection", features: providerPoints }],
    ];

    for (const [id, data] of sources) {
      if (map.getSource(id)) (map.getSource(id) as mapboxgl.GeoJSONSource).setData(data);
      else map.addSource(id, { type: "geojson", data });
    }

    const ensureLayer = (layerId: string, source: string, layerType: "circle" | "line", paint: Record<string, unknown>) => {
      if (!map.getLayer(layerId)) {
        map.addLayer({ id: layerId, type: layerType, source, paint } as mapboxgl.CircleLayer | mapboxgl.LineLayer);
      }
    };

    ensureLayer("ge-lines-layer", "ge-lines", "line", {
      "line-color": ["case", ["get", "arrived"], "#22c55e", "#3b82f6"],
      "line-width": 2,
    });
    ensureLayer("ge-customers-layer", "ge-customers", "circle", {
      "circle-color": "#059669",
      "circle-radius": 7,
      "circle-stroke-width": 2,
      "circle-stroke-color": "#fff",
    });
    ensureLayer("ge-targets-layer", "ge-at-home-targets", "circle", {
      "circle-color": "#6b7280",
      "circle-radius": 8,
      "circle-stroke-width": 2,
      "circle-stroke-color": "#fff",
    });
    ensureLayer("ge-salons-layer", "ge-salons", "circle", {
      "circle-color": "#a855f7",
      "circle-radius": 10,
      "circle-stroke-width": 2,
      "circle-stroke-color": "#fff",
    });
    ensureLayer("ge-providers-layer", "ge-providers", "circle", {
      "circle-color": "#2563eb",
      "circle-radius": 10,
      "circle-stroke-width": 2,
      "circle-stroke-color": "#fff",
    });
  }, [mapReady, mapState, privacyMode]);

  useEffect(() => {
    renderLayers();
  }, [renderLayers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const onClick = (e: mapboxgl.MapMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: ["ge-customers-layer", "ge-providers-layer", "ge-targets-layer", "ge-salons-layer"],
      });
      const f = features[0];
      if (!f?.properties) return;
      const props = f.properties as Record<string, unknown>;
      popupRef.current?.remove();

      if (props.kind === "customer" && props.user_id) {
        const uid = String(props.user_id);
        const name = String(props.display_name ?? "Customer");
        const city = props.city ? String(props.city) : "";
        const src = props.source === "saved_address" ? "Saved address" : "Last booking location";
        const profileHref = adminSpaAbsoluteUrl(`/admin/users/${uid}`);
        const html = `
          <div style="font-size:13px;max-width:260px">
            <div style="font-weight:600;margin-bottom:4px">${escapeHtml(name)}</div>
            <div style="color:#64748b;font-size:11px;margin-bottom:8px">${escapeHtml(src)}${city ? ` · ${escapeHtml(city)}` : ""}</div>
            <a href="${profileHref}" style="color:#2563eb;font-weight:500">Open user profile →</a>
          </div>`;
        popupRef.current = new mapboxgl.Popup({ closeButton: true }).setLngLat(e.lngLat).setHTML(html).addTo(map);
        return;
      }

      if (props.kind === "provider") {
        const name = String(props.name ?? "Provider");
        const pid = String(props.id ?? "");
        const href = adminSpaAbsoluteUrl(`/admin/providers/${pid}`);
        const html = `
          <div style="font-size:13px;max-width:220px">
            <div style="font-weight:600">${escapeHtml(name)}</div>
            <div style="margin-top:8px"><a href="${href}" style="color:#2563eb">Open provider →</a></div>
          </div>`;
        popupRef.current = new mapboxgl.Popup({ closeButton: true }).setLngLat(e.lngLat).setHTML(html).addTo(map);
      }
    };

    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
    };
  }, [mapReady]);

  if (mapboxToken === undefined) {
    return (
      <AdminPanel>
        <p className="text-sm text-gray-600">Loading map configuration…</p>
      </AdminPanel>
    );
  }

  if (!mapboxToken) {
    return (
      <AdminPanel>
        <p className="text-sm text-gray-700">
          Configure Mapbox in <span className="font-medium">Integrations &gt; Mapbox</span> to enable the live map, or set the{" "}
          <code className="rounded bg-gray-100 px-1 text-xs">NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN</code> environment variable.
        </p>
      </AdminPanel>
    );
  }

  const sum = mapState?.summary;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Traction &amp; safety map</h2>
          <p className="mt-1 text-sm text-gray-600">
            Customer density from saved addresses (preferred) or last booking coordinates — superadmin-only. Emerald = registered customers; blue =
            providers; gray = active at-home targets; purple = salons.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={privacyMode} onChange={(e) => setPrivacyMode(e.target.checked)} />
          Privacy fuzz (~200m)
        </label>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="w-full shrink-0 space-y-2 lg:w-56">
          <div className="rounded-xl border border-gray-200 bg-white p-3 text-sm">
            <h4 className="text-xs font-semibold uppercase text-gray-500">Map summary</h4>
            <dl className="mt-2 space-y-1.5">
              <div className="flex justify-between gap-2">
                <dt className="text-gray-600">Customers mapped</dt>
                <dd className="font-medium tabular-nums">{sum?.customers_mapped ?? mapState?.customer_markers?.length ?? 0}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-600">Active providers</dt>
                <dd className="font-medium tabular-nums">{sum?.active_providers ?? 0}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-600">At-home jobs</dt>
                <dd className="font-medium tabular-nums">{sum?.active_at_home ?? 0}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-600">En route / arrived</dt>
                <dd className="font-medium tabular-nums">
                  {sum?.en_route ?? 0} / {sum?.arrived ?? 0}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-600">At salon</dt>
                <dd className="font-medium tabular-nums">{sum?.at_salon ?? 0}</dd>
              </div>
            </dl>
          </div>
          <p className="text-xs text-gray-500">Refreshes every {POLL_MS / 1000}s. Click a marker for details and profile link.</p>
        </div>

        <div className="relative min-h-[420px] flex-1 overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
          <div ref={containerRef} className="absolute inset-0" />
          {mapQ.isLoading && !mapState ? (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80">
              <Activity className="h-8 w-8 animate-spin text-gray-400" aria-hidden />
            </div>
          ) : null}
          {mapQ.error ? (
            <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-red-700">
              {(mapQ.error as Error).message ?? "Failed to load map"}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
