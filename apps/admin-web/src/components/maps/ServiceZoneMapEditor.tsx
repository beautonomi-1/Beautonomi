import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import mapboxgl from "mapbox-gl";
import type MapboxDraw from "@mapbox/mapbox-gl-draw";
import { AdminMapContainer, type AdminMapHandle } from "./AdminMapContainer";
import { AdminModal } from "@/components/admin/AdminModal";
import { adminApi } from "@/lib/adminClient";
import { adminToast } from "@/lib/adminToast";
import {
  asGeomFeature,
  fitMapToZoneDetail,
  parseCentroidLngLat,
  type ZoneBbox,
} from "./serviceZoneMapGeo";
import { mapboxStyleAvailable, safeRemoveLayer, safeRemoveSource } from "./mapboxSafe";

const INC_SRC = "sz-inc-src";
const INC_FILL = "sz-inc-fill";
const INC_LINE = "sz-inc-line";
const EXC_SRC = "sz-exc-src";
const EXC_FILL = "sz-exc-fill";
const EXC_LINE = "sz-exc-line";
const COV_SRC = "sz-cov-src";
const COV_FILL = "sz-cov-fill";
const COV_LINE = "sz-cov-line";

type DrawIntent = "none" | "include" | "exclude";

type MapLayersPayload = {
  inclusion_geometry: GeoJSON.Geometry | null;
  exclusion_geometry: GeoJSON.Geometry | null;
  coverage_geometry: GeoJSON.Geometry | null;
};

type LayerVisibility = { inclusions: boolean; exclusions: boolean; coverage: boolean };

const LEGEND: { key: keyof LayerVisibility; label: string; sublabel: string }[] = [
  { key: "inclusions", label: "Included", sublabel: "Gross area from dataset" },
  { key: "exclusions", label: "Excluded", sublabel: "Cut out from included" },
  { key: "coverage", label: "Final coverage", sublabel: "What stays live" },
];

interface ServiceZoneMapEditorProps {
  zoneId: string;
  zoneVersion?: number;
  /** Existing geometry from the zone record — fallback coverage + camera */
  geometryGeojson?: unknown;
  /** Zone bbox from API — frames the map */
  zoneBbox?: ZoneBbox;
  /** Centroid for disconnected-fragment warning marker */
  zoneCentroid?: unknown;
  disconnectedFragments?: boolean;
  countryCode?: string | null;
  allowEdits?: boolean;
  className?: string;
  onCoverageUpdated?: () => void;
}

export function ServiceZoneMapEditor({
  zoneId,
  zoneVersion,
  geometryGeojson,
  zoneBbox,
  zoneCentroid,
  disconnectedFragments,
  countryCode,
  allowEdits = true,
  className = "min-h-[360px]",
  onCoverageUpdated,
}: ServiceZoneMapEditorProps) {
  const mapHandleRef = useRef<AdminMapHandle>(null);
  const drawRef = useRef<InstanceType<typeof MapboxDraw> | null>(null);
  const drawIntentRef = useRef<DrawIntent>("none");
  /** Bumps on unmount / stale map so async Draw attach never runs after the map was removed (React Strict Mode + GL v3). */
  const drawAttachTokenRef = useRef(0);

  const [mapReady, setMapReady] = useState(false);
  const [drawIntent, setDrawIntent] = useState<DrawIntent>("none");
  const [saving, setSaving] = useState(false);
  const [layers, setLayers] = useState<MapLayersPayload | null>(null);
  const [pendingGeom, setPendingGeom] = useState<GeoJSON.Polygon | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [layersVersion, setLayersVersion] = useState(0);
  const [layerError, setLayerError] = useState<string | null>(null);
  const [layerVisibility, setLayerVisibility] = useState<LayerVisibility>({
    inclusions: true,
    exclusions: true,
    coverage: true,
  });

  const onCoverageUpdatedRef = useRef(onCoverageUpdated);
  onCoverageUpdatedRef.current = onCoverageUpdated;

  useEffect(() => {
    drawIntentRef.current = drawIntent;
  }, [drawIntent]);

  /** Merge API layers with geometry fallback (parity with Next.js MarketMap). */
  const effectiveLayers = useMemo((): MapLayersPayload | null => {
    if (layers) {
      let coverage = layers.coverage_geometry;
      if (!coverage && geometryGeojson) {
        const g = geometryGeojson as GeoJSON.Geometry;
        if (g.type === "Polygon" || g.type === "MultiPolygon") coverage = g;
      }
      return { ...layers, coverage_geometry: coverage };
    }
    if (geometryGeojson) {
      const g = geometryGeojson as GeoJSON.Geometry;
      if (g.type === "Polygon" || g.type === "MultiPolygon") {
        return {
          inclusion_geometry: null,
          exclusion_geometry: null,
          coverage_geometry: g,
        };
      }
    }
    return null;
  }, [layers, geometryGeojson]);

  // Fetch map layers
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await adminApi.getJson<MapLayersPayload>(`/api/admin/service-zones/${zoneId}/map-layers`, {
          timeoutMs: 60_000,
        });
        if (!cancelled) {
          setLayers(res ?? null);
          setLayerError(null);
        }
      } catch {
        if (!cancelled) {
          setLayers(null);
          setLayerError("Could not load saved zone layers. You can still draw and save a new shape.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [zoneId, zoneVersion, layersVersion]);

  const handleMapReady = useCallback((map: mapboxgl.Map) => {
    setMapReady(true);
    const token = ++drawAttachTokenRef.current;

    (async () => {
      const [drawModule] = await Promise.all([
        import("@mapbox/mapbox-gl-draw"),
        import("@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css"),
      ]);
      if (token !== drawAttachTokenRef.current) return;
      const DrawClass = drawModule.default;

      const attachDraw = () => {
        if (token !== drawAttachTokenRef.current) return;
        if ((map as mapboxgl.Map & { _removed?: boolean })._removed) return;
        if (drawRef.current) return;
        try {
          if (!map.isStyleLoaded() || !map.getStyle()) return;
        } catch {
          return;
        }
        const draw = new DrawClass({
          displayControlsDefault: false,
          defaultMode: "simple_select",
        });
        map.addControl(draw as unknown as mapboxgl.IControl, "top-left");
        drawRef.current = draw;

        map.on("draw.create", (e: { features: GeoJSON.Feature[] }) => {
          const feature = e.features[0];
          const geom = feature?.geometry;
          let poly: GeoJSON.Polygon | null = null;
          if (geom?.type === "Polygon") {
            poly = geom as GeoJSON.Polygon;
          } else if (geom?.type === "MultiPolygon" && geom.coordinates[0]?.length) {
            poly = { type: "Polygon", coordinates: geom.coordinates[0] };
          }
          if (!poly) {
            adminToast.error("Draw one closed polygon area (double-click to finish).");
            try {
              draw.deleteAll();
            } catch {
              /* ignore */
            }
            setDrawIntent("none");
            return;
          }
          setPendingGeom(poly);
          setConfirmOpen(true);
        });
      };

      /**
       * Mapbox GL v3 + Draw: addControl must run after the style graph is stable.
       * `load` alone is not enough; `idle` + double rAF matches Draw + style internal timing.
       */
      const scheduleAttach = () => {
        if (token !== drawAttachTokenRef.current) return;
        if ((map as mapboxgl.Map & { _removed?: boolean })._removed) return;

        const runAfterIdle = () => {
          if (token !== drawAttachTokenRef.current) return;
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              attachDraw();
            });
          });
        };

        const waitStyle = () => {
          if (token !== drawAttachTokenRef.current) return;
          try {
            if (!map.isStyleLoaded()) {
              map.once("styledata", waitStyle);
              return;
            }
          } catch {
            return;
          }
          map.once("idle", runAfterIdle);
        };

        waitStyle();
      };

      scheduleAttach();
    })();
  }, []);

  useEffect(() => {
    return () => {
      drawAttachTokenRef.current += 1;
      try {
        const map = mapHandleRef.current?.getMap();
        const draw = drawRef.current;
        drawRef.current = null;
        if (map && draw) {
          map.removeControl(draw as unknown as mapboxgl.IControl);
        }
      } catch {
        /* ignore */
      }
    };
  }, []);

  // Render preview layers + fit camera after render (parity with Next.js MarketMap)
  useEffect(() => {
    const map = mapHandleRef.current?.getMap();
    if (!map || !mapReady) return;

    const remove = (ids: string[], srcs: string[]) => {
      for (const id of ids) {
        safeRemoveLayer(map, id);
      }
      for (const id of srcs) {
        safeRemoveSource(map, id);
      }
    };

    const vis = (visible: boolean) => (visible ? "visible" : "none") as "visible" | "none";

    let cancelled = false;

    const applyLayers = () => {
      if (cancelled || !map.isStyleLoaded() || !mapboxStyleAvailable(map)) return;

      remove(
        [COV_LINE, COV_FILL, EXC_LINE, EXC_FILL, INC_LINE, INC_FILL],
        [COV_SRC, EXC_SRC, INC_SRC],
      );

      const eff = effectiveLayers;
      if (!eff) {
        map.once("idle", () => {
          if (cancelled) return;
          fitMapToZoneDetail(map, mapboxgl, {
            bbox: zoneBbox,
            coverageFeature: null,
            geometryGeojson,
            countryCode,
          });
        });
        return;
      }

      const addPoly = (
        src: string,
        fill: string,
        line: string,
        geom: unknown,
        fillColor: string,
        fillOpacity: number,
        lineColor: string,
        visible: boolean,
      ) => {
        const f = asGeomFeature(geom);
        if (!f) return;
        map.addSource(src, { type: "geojson", data: f });
        map.addLayer({
          id: fill,
          type: "fill",
          source: src,
          layout: { visibility: vis(visible) },
          paint: { "fill-color": fillColor, "fill-opacity": fillOpacity },
        });
        map.addLayer({
          id: line,
          type: "line",
          source: src,
          layout: { visibility: vis(visible) },
          paint: { "line-color": lineColor, "line-width": 2, "line-opacity": 0.95 },
        });
      };

      addPoly(
        INC_SRC,
        INC_FILL,
        INC_LINE,
        eff.inclusion_geometry,
        "#0369a1",
        0.3,
        "#0c4a6e",
        layerVisibility.inclusions,
      );
      addPoly(
        EXC_SRC,
        EXC_FILL,
        EXC_LINE,
        eff.exclusion_geometry,
        "#e11d48",
        0.4,
        "#9f1239",
        layerVisibility.exclusions,
      );
      addPoly(
        COV_SRC,
        COV_FILL,
        COV_LINE,
        eff.coverage_geometry,
        "#047857",
        0.25,
        "#064e3b",
        layerVisibility.coverage,
      );

      const onIdle = () => {
        if (cancelled) return;
        const covF = asGeomFeature(eff.coverage_geometry);
        fitMapToZoneDetail(map, mapboxgl, {
          bbox: zoneBbox,
          coverageFeature: covF,
          geometryGeojson,
          countryCode,
        });
      };
      map.once("idle", onIdle);
    };

    if (map.isStyleLoaded()) applyLayers();
    else map.once("idle", applyLayers);

    return () => {
      cancelled = true;
      remove(
        [COV_LINE, COV_FILL, EXC_LINE, EXC_FILL, INC_LINE, INC_FILL],
        [COV_SRC, EXC_SRC, INC_SRC],
      );
    };
  }, [
    countryCode,
    effectiveLayers,
    geometryGeojson,
    layerVisibility,
    mapReady,
    zoneBbox,
  ]);

  // Disconnected fragments marker (parity with MarketMap)
  useEffect(() => {
    const map = mapHandleRef.current?.getMap();
    if (!map || !mapReady) return;

    if (!disconnectedFragments) return;

    const lngLat = parseCentroidLngLat(zoneCentroid);
    if (!lngLat) return;

    const el = document.createElement("div");
    el.style.cssText = [
      "width:20px;height:20px;border-radius:50%;",
      "background:#f97316;border:2px solid #fff;",
      "box-shadow:0 0 0 0 rgba(249,115,22,0.6);",
      "animation:pulse-ring-sz 1.6s infinite;",
    ].join("");
    if (!document.getElementById("pulse-ring-sz-style")) {
      const style = document.createElement("style");
      style.id = "pulse-ring-sz-style";
      style.textContent =
        "@keyframes pulse-ring-sz{0%{box-shadow:0 0 0 0 rgba(249,115,22,.6)}70%{box-shadow:0 0 0 10px rgba(249,115,22,0)}100%{box-shadow:0 0 0 0 rgba(249,115,22,0)}}";
      document.head.appendChild(style);
    }

    const popup = new mapboxgl.Popup({ offset: 14, closeButton: false }).setHTML(
      `<div style="font-size:12px;font-weight:600;color:#431407;max-width:200px">
        Coverage has disconnected parts — review inclusions
      </div>`,
    );
    const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
      .setLngLat(lngLat)
      .setPopup(popup)
      .addTo(map);

    return () => {
      marker.remove();
    };
  }, [mapReady, disconnectedFragments, zoneCentroid]);

  // Sync draw mode
  useEffect(() => {
    const draw = drawRef.current;
    const map = mapHandleRef.current?.getMap();
    if (!draw || !mapReady || !map) return;
    try {
      if (!map.isStyleLoaded()) return;
    } catch {
      return;
    }
    try {
      if (drawIntent === "none") {
        draw.changeMode("simple_select");
        if (!confirmOpen) draw.deleteAll();
      } else if (!confirmOpen) {
        draw.changeMode("draw_polygon");
      }
    } catch {
      /* ignore */
    }
  }, [drawIntent, mapReady, confirmOpen]);

  const cancelDraw = useCallback(() => {
    setDrawIntent("none");
    setConfirmOpen(false);
    setPendingGeom(null);
    try {
      drawRef.current?.deleteAll();
      drawRef.current?.changeMode("simple_select");
    } catch {
      /* ignore */
    }
  }, []);

  const handleConfirm = async () => {
    if (!pendingGeom) {
      cancelDraw();
      return;
    }
    setSaving(true);
    try {
      const intent = drawIntentRef.current;
      if (intent === "include") {
        const res = await adminApi.postJson<{ included?: number; matched_areas?: number; truncated?: boolean }>(
          `/api/admin/service-zones/${zoneId}/include-drawn`,
          { type: "custom_polygon", geojson: pendingGeom, version: zoneVersion },
        );
        const included = Number(res?.included ?? 0);
        if (included > 0) adminToast.success(`Included ${included} postal areas from drawn region`);
        else adminToast.info("No new postal areas matched this shape");
        if (res?.truncated) adminToast.warning("Selection reached safety cap; draw a smaller area");
      } else {
        await adminApi.postJson(`/api/admin/service-zones/${zoneId}/exclude`, {
          type: "custom_polygon",
          geojson: pendingGeom,
          version: zoneVersion,
        });
        adminToast.success("Excluded area added");
      }
      cancelDraw();
      setLayersVersion((v) => v + 1);
      onCoverageUpdatedRef.current?.();
    } catch (err) {
      adminToast.error(err instanceof Error ? err.message : "Could not save drawn area");
    } finally {
      setSaving(false);
    }
  };

  const toggleLayer = (key: keyof LayerVisibility) => {
    setLayerVisibility((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const intentLabel = drawIntentRef.current === "include" ? "inclusion" : "exclusion";

  return (
    <div className="relative">
      <AdminMapContainer ref={mapHandleRef} onMapReady={handleMapReady} className={className} />

      {/* Legend */}
      {mapReady && (
        <div className="absolute bottom-20 left-3 z-10 w-[min(calc(100%-1.5rem),220px)] rounded-xl border border-gray-200 bg-white/95 px-3 py-2.5 text-[11px] shadow-md backdrop-blur-sm sm:bottom-auto sm:top-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Layers</p>
          <ul className="mt-2 space-y-1.5">
            {LEGEND.map(({ key, label, sublabel }) => {
              const active = layerVisibility[key];
              return (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => toggleLayer(key)}
                    className="flex w-full items-start gap-2 rounded-md px-0.5 py-0.5 text-left transition hover:bg-gray-100"
                    title={active ? `Hide ${label}` : `Show ${label}`}
                  >
                    <span
                      className="mt-0.5 h-3 w-3 shrink-0 rounded-sm transition-opacity"
                      style={{
                        backgroundColor:
                          key === "inclusions"
                            ? "rgba(3,105,161,0.55)"
                            : key === "exclusions"
                              ? "rgba(225,29,72,0.55)"
                              : "rgba(4,120,87,0.35)",
                        border:
                          key === "coverage" ? "2px solid #064e3b" : "1px solid rgba(12,74,110,0.4)",
                        opacity: active ? 1 : 0.3,
                      }}
                    />
                    <span className={active ? "text-gray-900" : "text-gray-400"}>
                      <span className="font-medium">{label}</span>
                      <span className="block text-[10px] font-normal text-gray-500">{sublabel}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 border-t border-gray-100 pt-2 text-[10px] text-gray-500">
            Mapbox:{" "}
            <Link to="/mapbox" className="font-medium text-indigo-600 hover:underline">
              Integrations → Mapbox
            </Link>
          </p>
        </div>
      )}

      {mapReady && layerError ? (
        <div className="absolute right-3 top-3 z-10 max-w-xs rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {layerError}
        </div>
      ) : null}

      {/* Toolbar */}
      {mapReady && allowEdits && (
        <div className="absolute bottom-4 left-1/2 z-10 flex w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 flex-col items-center gap-2 pb-[env(safe-area-inset-bottom,0px)] sm:w-auto sm:pb-0">
          {drawIntent !== "none" && (
            <div className="w-full rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-center text-xs font-medium text-amber-950 shadow-md">
              Drawing {drawIntent === "include" ? "included" : "excluded"} area. Click the map to add corners.{" "}
              <strong>Double-click</strong> to finish.
            </div>
          )}
          <div className="flex flex-wrap justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-lg">
            {drawIntent === "none" ? (
              <>
                <button
                  type="button"
                  className="rounded-lg border border-green-300 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-800 hover:bg-green-100 disabled:opacity-50"
                  disabled={saving}
                  onClick={() => setDrawIntent("include")}
                >
                  Draw inclusion
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-800 hover:bg-red-100 disabled:opacity-50"
                  disabled={saving}
                  onClick={() => setDrawIntent("exclude")}
                >
                  Draw exclusion
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700"
                  disabled
                >
                  Finish shape on map…
                </button>
                <button
                  type="button"
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900"
                  disabled={saving}
                  onClick={cancelDraw}
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <AdminModal
        open={confirmOpen}
        onClose={cancelDraw}
        title={`Add ${intentLabel} area?`}
        description={
          drawIntentRef.current === "include"
            ? "This shape will auto-include intersecting postal areas and recompute coverage."
            : "This shape is subtracted from included areas. You can remove it later from the exclusions list."
        }
        footer={
          <>
            <button
              type="button"
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              disabled={saving}
              onClick={cancelDraw}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              disabled={saving}
              onClick={() => void handleConfirm()}
            >
              {saving ? "Saving…" : `Confirm ${intentLabel}`}
            </button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          {drawIntentRef.current === "include"
            ? "The drawn polygon will be matched against the postal-area dataset and qualifying areas will be added."
            : "The drawn polygon will be saved as a custom exclusion zone."}
        </p>
      </AdminModal>
    </div>
  );
}
