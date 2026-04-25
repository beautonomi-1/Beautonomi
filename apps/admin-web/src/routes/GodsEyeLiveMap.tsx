import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Activity } from "lucide-react";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminSpaAbsoluteUrl, adminSpaTo } from "@/lib/adminSpaPath";
import { AdminMapContainer } from "@/components/maps/AdminMapContainer";

const POLL_MS = 10_000;

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
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const hasAutoFocusedRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [privacyMode, setPrivacyMode] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState<Record<string, unknown> | null>(null);

  const mapQ = useQuery({
    queryKey: [...adminQueryKeys.godsEye(), "map-state"] as const,
    queryFn: () =>
      adminApi.getJson<MapState>("/api/admin/gods-eye/map-state?customer_markers_max=2500", { timeoutMs: 120_000 }),
    refetchInterval: POLL_MS,
  });

  const mapState = mapQ.data ?? null;

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

  const handleMapReady = useCallback((map: mapboxgl.Map) => {
    mapRef.current = map;
    setMapReady(true);
  }, []);

  useEffect(() => {
    return () => {
      popupRef.current?.remove();
      popupRef.current = null;
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    // Re-center with fresh bounds after toggling coordinate fuzzing mode.
    hasAutoFocusedRef.current = false;
  }, [privacyMode]);

  const focusMapToData = useCallback((map: mapboxgl.Map, points: Array<[number, number]>) => {
    if (points.length === 0) return;
    const bounds = points.reduce(
      (acc, [lng, lat]) => acc.extend([lng, lat]),
      new mapboxgl.LngLatBounds(points[0], points[0]),
    );
    map.fitBounds(bounds, { padding: 64, maxZoom: 13, duration: 800 });
  }, []);

  const renderLayers = useCallback(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !mapState) return;

    const apply = () => {
      if (!map.isStyleLoaded()) return;

    /** Non-clustered customer source from older builds — remove so we can recreate with clustering. */
    const migrateLegacyCustomerSource = () => {
      if (!map.getLayer("ge-customers-halo") && !map.getLayer("ge-customers-layer")) return;
      const customerStack = [
        "ge-customers-cluster-count",
        "ge-customers-clusters",
        "ge-customers-point",
        "ge-customers-point-halo",
        "ge-customers-layer",
        "ge-customers-halo",
        "ge-customers-heat",
      ];
      for (const lid of customerStack) {
        if (map.getLayer(lid)) map.removeLayer(lid);
      }
      if (map.getSource("ge-customers")) map.removeSource("ge-customers");
    };
    migrateLegacyCustomerSource();

    /** Recreate source if an older session added `ge-customers` without `cluster: true`. */
    const rebuildCustomerSourceIfNotClustered = () => {
      const src = map.getSource("ge-customers") as mapboxgl.GeoJSONSource | undefined;
      if (!src || src._options?.cluster === true) return;
      const customerLayers = [
        "ge-customers-cluster-count",
        "ge-customers-clusters",
        "ge-customers-point",
        "ge-customers-point-halo",
        "ge-customers-layer",
        "ge-customers-halo",
        "ge-customers-heat",
      ];
      for (const lid of customerLayers) {
        if (map.getLayer(lid)) map.removeLayer(lid);
      }
      map.removeSource("ge-customers");
    };
    rebuildCustomerSourceIfNotClustered();

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
          address_label: c.address_label,
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
      if (id === "ge-customers") {
        const existing = map.getSource(id) as mapboxgl.GeoJSONSource | undefined;
        if (existing) existing.setData(data);
        else {
          map.addSource(id, {
            type: "geojson",
            data,
            cluster: true,
            clusterMaxZoom: 14,
            clusterRadius: 52,
            clusterMinPoints: 2,
          });
        }
        continue;
      }
      if (map.getSource(id)) (map.getSource(id) as mapboxgl.GeoJSONSource).setData(data);
      else map.addSource(id, { type: "geojson", data });
    }

    const ensureLayer = (
      layerId: string,
      source: string,
      layerType: "circle" | "line" | "heatmap" | "symbol",
      paint: Record<string, unknown>,
      opts?: { filter?: mapboxgl.ExpressionSpecification; layout?: Record<string, unknown> },
    ) => {
      if (!map.getLayer(layerId)) {
        map.addLayer({
          id: layerId,
          type: layerType,
          source,
          paint,
          ...(opts?.filter ? { filter: opts.filter } : {}),
          ...(opts?.layout ? { layout: opts.layout } : {}),
        } as mapboxgl.AnyLayer);
      }
    };

    ensureLayer("ge-customers-heat", "ge-customers", "heatmap", {
      "heatmap-weight": 1,
      "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 4, 0.5, 10, 1.4],
      "heatmap-color": [
        "interpolate",
        ["linear"],
        ["heatmap-density"],
        0,
        "rgba(16,185,129,0)",
        0.2,
        "rgba(16,185,129,0.18)",
        0.45,
        "rgba(5,150,105,0.35)",
        0.7,
        "rgba(13,148,136,0.58)",
        1,
        "rgba(2,132,199,0.72)",
      ],
      "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 4, 16, 10, 34],
      "heatmap-opacity": 0.65,
    });
    ensureLayer("ge-lines-layer", "ge-lines", "line", {
      "line-color": ["case", ["get", "arrived"], "#22c55e", "#3b82f6"],
      "line-width": 2,
    });
    ensureLayer(
      "ge-customers-clusters",
      "ge-customers",
      "circle",
      {
        "circle-color": "#059669",
        "circle-radius": ["step", ["get", "point_count"], 18, 10, 22, 50, 28, 200, 36],
        "circle-opacity": 0.92,
        "circle-stroke-width": 2,
        "circle-stroke-color": "#fff",
      },
      { filter: ["has", "point_count"] },
    );
    ensureLayer(
      "ge-customers-cluster-count",
      "ge-customers",
      "symbol",
      {
        "text-color": "#ffffff",
      },
      {
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
          "text-size": 12,
        },
      },
    );
    ensureLayer(
      "ge-customers-point-halo",
      "ge-customers",
      "circle",
      {
        "circle-color": "#10b981",
        "circle-radius": 12,
        "circle-opacity": 0.16,
      },
      { filter: ["!", ["has", "point_count"]] },
    );
    ensureLayer(
      "ge-customers-point",
      "ge-customers",
      "circle",
      {
        "circle-color": "#059669",
        "circle-radius": 7,
        "circle-stroke-width": 2,
        "circle-stroke-color": "#fff",
      },
      { filter: ["!", ["has", "point_count"]] },
    );
    ensureLayer("ge-targets-halo", "ge-at-home-targets", "circle", {
      "circle-color": "#6b7280",
      "circle-radius": 13,
      "circle-opacity": 0.15,
    });
    ensureLayer("ge-targets-layer", "ge-at-home-targets", "circle", {
      "circle-color": "#6b7280",
      "circle-radius": 8,
      "circle-stroke-width": 2,
      "circle-stroke-color": "#fff",
    });
    ensureLayer("ge-salons-halo", "ge-salons", "circle", {
      "circle-color": "#a855f7",
      "circle-radius": 16,
      "circle-opacity": 0.14,
    });
    ensureLayer("ge-salons-layer", "ge-salons", "circle", {
      "circle-color": "#a855f7",
      "circle-radius": 11,
      "circle-stroke-width": 2,
      "circle-stroke-color": "#fff",
    });
    ensureLayer("ge-providers-halo", "ge-providers", "circle", {
      "circle-color": "#2563eb",
      "circle-radius": 16,
      "circle-opacity": 0.14,
    });
    ensureLayer("ge-providers-layer", "ge-providers", "circle", {
      "circle-color": "#2563eb",
      "circle-radius": 11,
      "circle-stroke-width": 2,
      "circle-stroke-color": "#fff",
    });

    if (!hasAutoFocusedRef.current) {
      const allPoints = [
        ...customers.map((f) => f.geometry.coordinates as [number, number]),
        ...providerPoints.map((f) => f.geometry.coordinates as [number, number]),
        ...atHomeTargets.map((f) => f.geometry.coordinates as [number, number]),
        ...salonPoints.map((f) => f.geometry.coordinates as [number, number]),
      ];
      focusMapToData(map, allPoints);
      hasAutoFocusedRef.current = true;
    }
    };

    if (map.isStyleLoaded()) {
      apply();
    } else {
      map.once("idle", apply);
    }
  }, [focusMapToData, mapReady, mapState, privacyMode]);

  useEffect(() => {
    renderLayers();
  }, [renderLayers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const interactiveLayers = [
      "ge-customers-point",
      "ge-customers-clusters",
      "ge-customers-cluster-count",
      "ge-providers-layer",
      "ge-targets-layer",
      "ge-salons-layer",
    ];

    const onMove = (e: mapboxgl.MapMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point, { layers: interactiveLayers });
      map.getCanvas().style.cursor = features.length > 0 ? "pointer" : "";
    };

    const onClick = (e: mapboxgl.MapMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point, { layers: interactiveLayers });
      const f = features[0];
      if (!f?.properties) return;
      const props = f.properties as Record<string, unknown>;
      popupRef.current?.remove();

      const clusterIdRaw = props.cluster_id;
      const pointCount = props.point_count;
      if (clusterIdRaw != null && pointCount != null) {
        const clusterId = Number(clusterIdRaw);
        const count = Number(pointCount);
        setSelectedFeature({ kind: "customer_cluster", point_count: count, cluster_id: clusterId });
        const geo = f.geometry as { type: string; coordinates: [number, number] };
        const center = geo.coordinates;
        const custSrc = map.getSource("ge-customers") as mapboxgl.GeoJSONSource;
        custSrc.getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (!err && zoom != null) {
            map.easeTo({ center, zoom });
          }
        });
        const html = `
          <div style="font-size:13px;max-width:220px">
            <div style="font-weight:600;margin-bottom:4px">${count} customers</div>
            <div style="color:#64748b;font-size:11px">Click zooms in; repeat until individual pins appear.</div>
          </div>`;
        popupRef.current = new mapboxgl.Popup({ closeButton: true }).setLngLat(e.lngLat).setHTML(html).addTo(map);
        return;
      }

      setSelectedFeature(props);

      if (props.kind === "customer" && props.user_id) {
        const uid = String(props.user_id);
        const name = String(props.display_name ?? "Customer");
        const city = props.city ? String(props.city) : "";
        const addr = props.address_label ? String(props.address_label) : "";
        const email = props.email ? String(props.email) : "";
        const phone = props.phone ? String(props.phone) : "";
        const src = props.source === "saved_address" ? "Saved address" : "Last booking location";
        const profileHref = adminSpaAbsoluteUrl(`/admin/users/${uid}`);
        const html = `
          <div style="font-size:13px;max-width:260px">
            <div style="font-weight:600;margin-bottom:4px">${escapeHtml(name)}</div>
            <div style="color:#64748b;font-size:11px;margin-bottom:8px">${escapeHtml(src)}${city ? ` · ${escapeHtml(city)}` : ""}${addr ? `<br/>${escapeHtml(addr)}` : ""}</div>
            ${email ? `<div style="color:#64748b;font-size:11px;margin-bottom:2px">${escapeHtml(email)}</div>` : ""}
            ${phone ? `<div style="color:#64748b;font-size:11px;margin-bottom:8px">${escapeHtml(phone)}</div>` : ""}
            <a href="${profileHref}" style="color:#2563eb;font-weight:500">Open user profile →</a>
          </div>`;
        popupRef.current = new mapboxgl.Popup({ closeButton: true }).setLngLat(e.lngLat).setHTML(html).addTo(map);
        return;
      }

      if (props.kind === "provider") {
        const name = String(props.name ?? "Provider");
        const pid = String(props.id ?? "");
        const href = adminSpaAbsoluteUrl(`/admin/providers/${pid}`);
        const status = String(props.status ?? "idle").replace(/_/g, " ");
        const html = `
          <div style="font-size:13px;max-width:220px">
            <div style="font-weight:600">${escapeHtml(name)}</div>
            <div style="color:#64748b;font-size:11px;margin:4px 0 8px">Status: ${escapeHtml(status)}</div>
            <div style="margin-top:8px"><a href="${href}" style="color:#2563eb">Open provider →</a></div>
          </div>`;
        popupRef.current = new mapboxgl.Popup({ closeButton: true }).setLngLat(e.lngLat).setHTML(html).addTo(map);
      }
    };

    map.on("mousemove", onMove);
    map.on("click", onClick);
    return () => {
      map.off("mousemove", onMove);
      map.off("click", onClick);
      map.getCanvas().style.cursor = "";
    };
  }, [mapReady]);

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
            <button
              type="button"
              onClick={() => {
                const map = mapRef.current;
                if (!map || !mapState) return;
                const points: Array<[number, number]> = [];
                for (const c of mapState.customer_markers ?? []) points.push(toMapPosition(c.lat, c.lng, privacyMode));
                for (const p of mapState.providers) {
                  if (p.last_lat != null && p.last_lng != null) points.push(toMapPosition(p.last_lat, p.last_lng, privacyMode));
                }
                for (const b of mapState.at_home_bookings) {
                  if (b.customer_target_lat != null && b.customer_target_lng != null) {
                    points.push(toMapPosition(b.customer_target_lat, b.customer_target_lng, privacyMode));
                  }
                }
                for (const s of mapState.at_salon_bookings) points.push(toMapPosition(s.salon_lat, s.salon_lng, privacyMode));
                focusMapToData(map, points);
              }}
              className="mt-3 inline-flex w-full items-center justify-center rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
            >
              Focus on all markers
            </button>
          </div>
          {selectedFeature ? (
            <div className="rounded-xl border border-gray-200 bg-white p-3 text-xs">
              <h4 className="mb-2 text-[11px] font-semibold uppercase text-gray-500">Selected marker</h4>
              {selectedFeature.kind === "provider" ? (
                <div className="space-y-1.5">
                  <p className="font-medium text-gray-900">{String(selectedFeature.name ?? "Provider")}</p>
                  <p className="text-gray-600">Status: {String(selectedFeature.status ?? "idle").replace(/_/g, " ")}</p>
                  <a
                    href={adminSpaTo(`/admin/providers/${String(selectedFeature.id ?? "")}`)}
                    className="inline-flex text-xs font-medium text-primary hover:underline"
                  >
                    Open provider profile
                  </a>
                </div>
              ) : selectedFeature.kind === "customer" ? (
                <div className="space-y-1.5">
                  <p className="font-medium text-gray-900">{String(selectedFeature.display_name ?? "Customer")}</p>
                  <p className="text-gray-600">
                    {selectedFeature.source === "saved_address" ? "Saved address" : "Last booking location"}
                    {selectedFeature.city ? ` · ${String(selectedFeature.city)}` : ""}
                  </p>
                  {selectedFeature.address_label ? (
                    <p className="text-gray-600">{String(selectedFeature.address_label)}</p>
                  ) : null}
                  {selectedFeature.email ? <p className="text-gray-600">{String(selectedFeature.email)}</p> : null}
                  {selectedFeature.phone ? <p className="text-gray-600">{String(selectedFeature.phone)}</p> : null}
                  <a
                    href={adminSpaTo(`/admin/users/${String(selectedFeature.user_id ?? "")}`)}
                    className="inline-flex text-xs font-medium text-primary hover:underline"
                  >
                    Open customer profile
                  </a>
                </div>
              ) : selectedFeature.kind === "customer_cluster" ? (
                <div className="space-y-1.5">
                  <p className="font-medium text-gray-900">{String(selectedFeature.point_count ?? 0)} customers</p>
                  <p className="text-gray-600">Clustered at this zoom. Click the map again after zooming to open individual profiles.</p>
                </div>
              ) : selectedFeature.kind === "target" ? (
                <div className="space-y-1.5">
                  <p className="font-medium text-gray-900">At-home target</p>
                  <p className="text-gray-600">Booking: {String(selectedFeature.booking_id ?? "—")}</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <p className="font-medium text-gray-900">Salon location</p>
                  <p className="text-gray-600">Booking: {String(selectedFeature.booking_id ?? "—")}</p>
                </div>
              )}
            </div>
          ) : null}
          <p className="text-xs text-gray-500">
            Refreshes every {POLL_MS / 1000}s. Customer clusters zoom in on click; single pins open profile links.
          </p>
        </div>

        <div className="relative min-h-[420px] flex-1">
          {/*
           * Use AdminMapContainer (same as service zones): flex-sized canvas avoids 0×0 Mapbox in admin shell layouts.
           * Do not use absolute inset-0 for the map container — it often yields an invisible canvas in flex rows.
           */}
          <AdminMapContainer className="min-h-[420px] w-full flex-1" onMapReady={handleMapReady} />
          {mapReady && mapQ.isLoading && !mapState ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/70">
              <Activity className="h-8 w-8 animate-spin text-gray-400" aria-hidden />
            </div>
          ) : null}
          {mapQ.error ? (
            <div className="absolute inset-0 flex items-center justify-center bg-white/90 p-4 text-center text-sm text-red-700">
              {(mapQ.error as Error).message ?? "Failed to load map data"}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
