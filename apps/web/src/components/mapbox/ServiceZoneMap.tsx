"use client";

import React, { useEffect, useRef, useState } from "react";
import { fetchMapboxPublicMapConfig } from "@/lib/mapbox/fetch-public-map-config";
import { attachMapResize } from "@/lib/mapbox/attach-map-resize";
import { Loader2, MapPin, Check } from "lucide-react";
import { toast } from "sonner";

interface PlatformZone {
  id: string;
  name: string;
  /** GeoJSON geometry stored on platform_zones.geometry */
  geometry?: {
    type: string;
    coordinates: unknown;
  } | null;
  bbox?: number[] | { minLng: number; minLat: number; maxLng: number; maxLat: number } | null;
  is_active?: boolean;
}

interface ServiceZoneMapProps {
  /** Active platform zones to display as read-only coverage layers */
  zones: PlatformZone[];
  /** Provider's primary location for initial map center */
  providerLocation?: { latitude: number; longitude: number };
  /**
   * Called when the provider clicks "Select this zone" on a zone popup.
   * Replaces the old onZoneCreate (polygon drawing) callback.
   */
  onZoneSelect?: (platformZoneId: string) => void;
  /**
   * IDs of zones this provider has already joined — used to render a
   * "Joined" badge instead of a "Select" button.
   */
  selectedZoneIds?: string[];
  /** When true, "Select this zone" buttons are shown on zone popups. */
  editable?: boolean;
  height?: string;
}

export default function ServiceZoneMap({
  zones,
  providerLocation,
  onZoneSelect,
  selectedZoneIds = [],
  editable = false,
  height = "500px",
}: ServiceZoneMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const popupsRef = useRef<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectingId, setSelectingId] = useState<string | null>(null);

  const selectedSet = new Set(selectedZoneIds);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    let mapInstance: any = null;
    let detachResize: (() => void) | undefined;
    let cancelled = false;

    const initMap = async () => {
      try {
        const mapboxgl = (await import("mapbox-gl")).default;
        await import("mapbox-gl/dist/mapbox-gl.css");
        if (cancelled || !mapContainerRef.current) return;

        const cfg = await fetchMapboxPublicMapConfig();
        if (cancelled || !mapContainerRef.current) return;
        if (!cfg.accessToken) {
          throw new Error("Mapbox public token not configured (Admin → Mapbox)");
        }

        const container = mapContainerRef.current!;
        mapInstance = new mapboxgl.Map({
          container,
          accessToken: cfg.accessToken,
          style: cfg.styleUrl?.trim() || "mapbox://styles/mapbox/streets-v12",
          center: providerLocation
            ? [providerLocation.longitude, providerLocation.latitude]
            : [28.0473, -26.2041],
          zoom: providerLocation ? 12 : 10,
        });

        detachResize = attachMapResize(mapInstance, container);

        mapRef.current = mapInstance;
        mapInstance.addControl(new mapboxgl.NavigationControl(), "top-right");

        mapInstance.on("load", () => {
          if (cancelled) return;
          // Provider location marker
          if (providerLocation) {
            new mapboxgl.Marker({ color: "#FF0077" })
              .setLngLat([providerLocation.longitude, providerLocation.latitude])
              .setPopup(new mapboxgl.Popup().setHTML("<b>Your Location</b>"))
              .addTo(mapInstance);
          }

          // Render each platform zone as a read-only fill + outline layer
          const bounds = new mapboxgl.LngLatBounds();
          let hasBounds = false;

          zones.forEach((zone, idx) => {
            const isJoined = selectedSet.has(zone.id);

            // Determine geometry source
            let geomFeature: any = null;
            if (zone.geometry && zone.geometry.type) {
              geomFeature = {
                type: "Feature",
                properties: { id: zone.id, name: zone.name, joined: isJoined },
                geometry: zone.geometry,
              };
            }

            if (geomFeature) {
              const srcId = `pz-src-${idx}`;
              const fillId = `pz-fill-${idx}`;
              const lineId = `pz-line-${idx}`;

              mapInstance.addSource(srcId, { type: "geojson", data: geomFeature });
              mapInstance.addLayer({
                id: fillId,
                type: "fill",
                source: srcId,
                paint: {
                  "fill-color": isJoined ? "#059669" : "#FF0077",
                  "fill-opacity": 0.15,
                },
              });
              mapInstance.addLayer({
                id: lineId,
                type: "line",
                source: srcId,
                paint: {
                  "line-color": isJoined ? "#047857" : "#D60565",
                  "line-width": 2,
                },
              });

              // Extend map bounds
              try {
                const g = geomFeature.geometry;
                const flatCoords: [number, number][] =
                  g.type === "MultiPolygon"
                    ? g.coordinates.flat(2)
                    : g.type === "Polygon"
                    ? g.coordinates[0]
                    : [];
                for (const c of flatCoords) {
                  bounds.extend(c as [number, number]);
                  hasBounds = true;
                }
              } catch { /* ignore */ }

              // Click on zone fill to show popup
              mapInstance.on("click", fillId, (e: any) => {
                const popup = new mapboxgl.Popup({ offset: 8 });
                const content = document.createElement("div");
                content.style.cssText = "padding:4px 2px;min-width:160px;font-family:inherit";

                const title = document.createElement("p");
                title.style.cssText = "font-weight:700;font-size:13px;color:#0f172a;margin:0 0 6px";
                title.textContent = zone.name;
                content.appendChild(title);

                if (isJoined) {
                  const badge = document.createElement("span");
                  badge.style.cssText =
                    "display:inline-flex;align-items:center;gap:4px;background:#d1fae5;color:#065f46;font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px";
                  badge.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> Joined`;
                  content.appendChild(badge);
                } else if (editable && onZoneSelect) {
                  const btn = document.createElement("button");
                  btn.textContent = "Select this zone";
                  btn.style.cssText =
                    "background:#FF0077;color:#fff;border:none;border-radius:6px;padding:5px 12px;font-size:12px;font-weight:600;cursor:pointer;width:100%";
                  btn.onmouseenter = () => { btn.style.background = "#D60565"; };
                  btn.onmouseleave = () => { btn.style.background = "#FF0077"; };
                  btn.onclick = () => {
                    popup.remove();
                    setSelectingId(zone.id);
                    Promise.resolve(onZoneSelect(zone.id)).finally(() => setSelectingId(null));
                  };
                  content.appendChild(btn);
                } else {
                  const note = document.createElement("p");
                  note.style.cssText = "font-size:11px;color:#64748b;margin:0";
                  note.textContent = "Platform coverage area";
                  content.appendChild(note);
                }

                popup
                  .setLngLat(e.lngLat)
                  .setDOMContent(content)
                  .addTo(mapInstance);
                popupsRef.current.push(popup);
              });

              mapInstance.on("mouseenter", fillId, () => {
                mapInstance.getCanvas().style.cursor = "pointer";
              });
              mapInstance.on("mouseleave", fillId, () => {
                mapInstance.getCanvas().style.cursor = "";
              });
            } else if (zone.bbox) {
              // Fallback: render bbox rectangle when full geometry isn't available
              const bbox = zone.bbox;
              let minLng: number, minLat: number, maxLng: number, maxLat: number;
              if (Array.isArray(bbox) && bbox.length >= 4) {
                [minLng, minLat, maxLng, maxLat] = bbox as [number, number, number, number];
              } else if (typeof bbox === "object" && "minLng" in bbox) {
                ({ minLng, minLat, maxLng, maxLat } = bbox as {
                  minLng: number; minLat: number; maxLng: number; maxLat: number;
                });
              } else {
                return;
              }

              const bboxFeature = {
                type: "Feature",
                properties: {},
                geometry: {
                  type: "Polygon",
                  coordinates: [[[minLng, minLat], [maxLng, minLat], [maxLng, maxLat], [minLng, maxLat], [minLng, minLat]]],
                },
              };
              const srcId = `pz-bbox-${idx}`;
              const lineId = `pz-bbox-line-${idx}`;
              mapInstance.addSource(srcId, { type: "geojson", data: bboxFeature });
              mapInstance.addLayer({
                id: lineId,
                type: "line",
                source: srcId,
                paint: { "line-color": "#94a3b8", "line-width": 1.5, "line-dasharray": [4, 3] },
              });

              bounds.extend([minLng, minLat]);
              bounds.extend([maxLng, maxLat]);
              hasBounds = true;

              // Add a marker for the zone name
              const el = document.createElement("div");
              el.style.cssText =
                "background:#fff;border:1.5px solid #94a3b8;border-radius:6px;padding:2px 8px;font-size:11px;font-weight:600;color:#334155;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.1)";
              el.textContent = zone.name;
              new mapboxgl.Marker({ element: el, anchor: "center" })
                .setLngLat([(minLng + maxLng) / 2, (minLat + maxLat) / 2])
                .addTo(mapInstance);
            }
          });

          if (hasBounds && !providerLocation) {
            mapInstance.fitBounds(bounds, { padding: 60, maxZoom: 12 });
          }

          setIsLoading(false);
        });

        mapInstance.on("error", (e: any) => {
          console.error("Map error:", e);
          setIsLoading(false);
        });
      } catch (error: any) {
        console.error("Failed to initialize ServiceZoneMap:", error);
        toast.error("Failed to load map. Please check Mapbox configuration.");
        setIsLoading(false);
      }
    };

    void initMap();

    return () => {
      cancelled = true;
      detachResize?.();
      popupsRef.current.forEach((p) => { try { p.remove(); } catch { /* ignore */ } });
      popupsRef.current = [];
      if (mapInstance) mapInstance.remove();
    };
  }, [zones, providerLocation, editable]);

  return (
    <div className="relative" style={{ height }}>
      <div ref={mapContainerRef} style={{ height: "100%", width: "100%" }} className="rounded-lg" />

      {isLoading && (
        <div
          className="absolute inset-0 flex items-center justify-center rounded-lg bg-slate-100"
        >
          <Loader2 className="h-6 w-6 animate-spin text-[#FF0077]" />
        </div>
      )}

      {/* Zone legend */}
      {!isLoading && zones.length > 0 && (
        <div className="absolute bottom-3 left-3 z-10 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-md backdrop-blur-sm">
          <ul className="space-y-1">
            <li className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: "rgba(255,0,119,0.5)", border: "1.5px solid #D60565" }} />
              <span className="text-slate-700">Available zones</span>
            </li>
            {selectedSet.size > 0 && (
              <li className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: "rgba(5,150,105,0.4)", border: "1.5px solid #047857" }} />
                <span className="text-slate-700">Joined zones</span>
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Summary bar */}
      {!isLoading && zones.length > 0 && (
        <div className="absolute right-3 top-3 z-10 flex flex-col gap-1.5">
          {selectedSet.size > 0 && (
            <div className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-white/95 px-3 py-1.5 text-xs font-semibold text-emerald-800 shadow-sm">
              <Check className="h-3 w-3" />
              {selectedSet.size} zone{selectedSet.size > 1 ? "s" : ""} joined
            </div>
          )}
          {selectingId && (
            <div className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm">
              <Loader2 className="h-3 w-3 animate-spin" />
              Joining zone…
            </div>
          )}
        </div>
      )}

      {!isLoading && zones.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg bg-slate-50/90">
          <MapPin className="h-7 w-7 text-slate-400" />
          <p className="text-sm font-medium text-slate-600">No coverage zones available yet</p>
          <p className="text-xs text-slate-500">Check back once markets have been published.</p>
        </div>
      )}
    </div>
  );
}
