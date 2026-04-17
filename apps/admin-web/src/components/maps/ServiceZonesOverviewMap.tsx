import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { fetchMapboxPublicMapConfig } from "@/lib/fetchMapboxPublicMapConfig";
import { bboxToPolygonFeature, type ZoneBbox } from "./serviceZoneMapGeo";

const OV_SOURCE = "sz-ov-src";
const OV_FILL = "sz-ov-fill";
const OV_LINE = "sz-ov-line";
const DEFAULT_CENTER: [number, number] = [28.0473, -26.2041];
const DEFAULT_ZOOM = 6;

export type OverviewZone = {
  id: string;
  name?: string;
  status?: string;
  bbox?: ZoneBbox;
};

type ServiceZonesOverviewMapProps = {
  zones: OverviewZone[];
  className?: string;
};

/**
 * All-markets bbox overview (parity with Next.js MarketMap when no market is selected).
 */
export function ServiceZonesOverviewMap({ zones, className = "" }: ServiceZonesOverviewMapProps) {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [styleUrl, setStyleUrl] = useState<string | null>(null);

  useEffect(() => {
    let c = false;
    (async () => {
      const cfg = await fetchMapboxPublicMapConfig();
      if (c) return;
      setToken(cfg.accessToken ?? null);
      setStyleUrl(cfg.styleUrl);
    })();
    return () => {
      c = true;
    };
  }, []);

  useEffect(() => {
    if (token === undefined || token === null || !containerRef.current) return;
    let cancelled = false;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      accessToken: token,
      style: styleUrl?.trim() || "mapbox://styles/mapbox/streets-v12",
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: true,
    });
    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    map.on("load", () => {
      if (cancelled) return;
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

    const el = containerRef.current;
    const ro = new ResizeObserver(() => {
      try {
        map.resize();
      } catch {
        /* ignore */
      }
    });
    ro.observe(el);

    return () => {
      cancelled = true;
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [token, styleUrl]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    let cancelled = false;

    const removeOverview = () => {
      if (map.getLayer(OV_LINE)) map.removeLayer(OV_LINE);
      if (map.getLayer(OV_FILL)) map.removeLayer(OV_FILL);
      if (map.getSource(OV_SOURCE)) map.removeSource(OV_SOURCE);
    };

    const apply = (): (() => void) => {
      if (cancelled) return () => {};

      removeOverview();

      const features: GeoJSON.Feature<GeoJSON.Polygon>[] = [];
      const bounds = new mapboxgl.LngLatBounds();
      let hasBounds = false;

      for (const z of zones) {
        const f = bboxToPolygonFeature(z.bbox);
        if (!f) continue;
        (f.properties as Record<string, unknown>) = { id: z.id, name: z.name, status: z.status };
        features.push(f);
        const coords = f.geometry.coordinates[0];
        for (const c of coords) {
          bounds.extend(c as [number, number]);
          hasBounds = true;
        }
      }

      if (features.length === 0) {
        return () => {
          removeOverview();
        };
      }

      const fc: GeoJSON.FeatureCollection = { type: "FeatureCollection", features };
      map.addSource(OV_SOURCE, { type: "geojson", data: fc });
      map.addLayer({
        id: OV_FILL,
        type: "fill",
        source: OV_SOURCE,
        paint: { "fill-color": "#0369a1", "fill-opacity": 0.12 },
      });
      map.addLayer({
        id: OV_LINE,
        type: "line",
        source: OV_SOURCE,
        paint: { "line-color": "#0c4a6e", "line-width": 1.5, "line-opacity": 0.7 },
      });

      const handleClick = (e: mapboxgl.MapLayerMouseEvent) => {
        const feat = e.features?.[0];
        const id = feat?.properties?.id as string | undefined;
        if (id) navigate(`/service-zones/${id}`);
      };
      const handleMouseEnter = () => {
        map.getCanvas().style.cursor = "pointer";
      };
      const handleMouseLeave = () => {
        map.getCanvas().style.cursor = "";
      };

      map.on("click", OV_FILL, handleClick);
      map.on("mouseenter", OV_FILL, handleMouseEnter);
      map.on("mouseleave", OV_FILL, handleMouseLeave);

      if (hasBounds) {
        map.fitBounds(bounds, { padding: 60, maxZoom: 10 });
      }

      return () => {
        try {
          map.off("click", OV_FILL, handleClick);
          map.off("mouseenter", OV_FILL, handleMouseEnter);
          map.off("mouseleave", OV_FILL, handleMouseLeave);
          map.getCanvas().style.cursor = "";
        } catch {
          /* ignore */
        }
        removeOverview();
      };
    };

    let innerCleanup: (() => void) | undefined;

    const run = () => {
      if (cancelled) return;
      if (!map.isStyleLoaded()) {
        map.once("idle", run);
        return;
      }
      innerCleanup = apply();
    };

    run();

    return () => {
      cancelled = true;
      innerCleanup?.();
    };
  }, [zones, mapReady, navigate]);

  if (token === undefined) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl border border-gray-200 bg-gray-50 ${className}`}
      >
        <p className="text-sm text-gray-600">Loading map configuration…</p>
      </div>
    );
  }

  if (!token) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50/90 p-6 text-center ${className}`}
      >
        <p className="text-sm font-semibold text-amber-950">Map preview unavailable</p>
        <p className="max-w-sm text-xs leading-relaxed text-amber-900/90">
          Add a public Mapbox token under <span className="font-medium">Integrations → Mapbox</span> or set{" "}
          <code className="rounded bg-amber-100 px-1 text-[11px]">VITE_MAPBOX_ACCESS_TOKEN</code>.
        </p>
      </div>
    );
  }

  const withBbox = zones.filter((z) => bboxToPolygonFeature(z.bbox));

  return (
    <div className={`relative flex min-h-0 flex-col ${className}`}>
      <div
        ref={containerRef}
        className="min-h-[280px] w-full flex-1 rounded-xl border border-gray-200 bg-gray-100 shadow-inner"
      />
      {withBbox.length > 0 ? (
        <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full border border-gray-300 bg-white/90 px-3 py-1 text-xs font-semibold text-gray-700 shadow-md backdrop-blur-sm">
          Click a zone boundary to open it
        </div>
      ) : (
        <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full border border-gray-200 bg-white/90 px-3 py-1 text-xs text-gray-500 shadow-sm">
          No zone bounding boxes yet — open a zone to draw coverage
        </div>
      )}
    </div>
  );
}
