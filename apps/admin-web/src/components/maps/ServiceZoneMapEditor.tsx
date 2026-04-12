import { useCallback, useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import type MapboxDraw from "@mapbox/mapbox-gl-draw";
import { AdminMapContainer, type AdminMapHandle } from "./AdminMapContainer";
import { AdminModal } from "@/components/admin/AdminModal";
import { adminApi } from "@/lib/adminClient";
import { adminToast } from "@/lib/adminToast";

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

function asFeature(g: unknown): GeoJSON.Feature | null {
  if (!g || typeof g !== "object") return null;
  const o = g as { type?: string };
  if (o.type !== "Polygon" && o.type !== "MultiPolygon") return null;
  return { type: "Feature", properties: {}, geometry: o as GeoJSON.Polygon | GeoJSON.MultiPolygon };
}

function fitToGeometry(map: mapboxgl.Map, geom: GeoJSON.Geometry) {
  const coords: number[][] = [];
  const walk = (g: GeoJSON.Geometry) => {
    if (g.type === "Polygon") g.coordinates[0].forEach((c) => coords.push(c));
    else if (g.type === "MultiPolygon") g.coordinates.forEach((p) => p[0].forEach((c) => coords.push(c)));
  };
  walk(geom);
  if (coords.length === 0) return;
  const bounds = coords.reduce(
    (b, c) => b.extend(c as [number, number]),
    new mapboxgl.LngLatBounds(coords[0] as [number, number], coords[0] as [number, number]),
  );
  map.fitBounds(bounds, { padding: 48, maxZoom: 13 });
}

interface ServiceZoneMapEditorProps {
  zoneId: string;
  zoneVersion?: number;
  /** Existing geometry from the zone record for initial bounds */
  geometryGeojson?: unknown;
  allowEdits?: boolean;
  className?: string;
  onCoverageUpdated?: () => void;
}

export function ServiceZoneMapEditor({
  zoneId,
  zoneVersion,
  geometryGeojson,
  allowEdits = true,
  className = "min-h-[360px]",
  onCoverageUpdated,
}: ServiceZoneMapEditorProps) {
  const mapHandleRef = useRef<AdminMapHandle>(null);
  const drawRef = useRef<InstanceType<typeof MapboxDraw> | null>(null);
  const drawIntentRef = useRef<DrawIntent>("none");
  const [mapReady, setMapReady] = useState(false);
  const [drawIntent, setDrawIntent] = useState<DrawIntent>("none");
  const [saving, setSaving] = useState(false);
  const [layers, setLayers] = useState<MapLayersPayload | null>(null);
  const [pendingGeom, setPendingGeom] = useState<GeoJSON.Polygon | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [layersVersion, setLayersVersion] = useState(0);
  const [layerError, setLayerError] = useState<string | null>(null);

  const onCoverageUpdatedRef = useRef(onCoverageUpdated);
  onCoverageUpdatedRef.current = onCoverageUpdated;

  useEffect(() => { drawIntentRef.current = drawIntent; }, [drawIntent]);

  // Fetch map layers
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await adminApi.getJson<{ data: MapLayersPayload }>(
          `/api/admin/service-zones/${zoneId}/map-layers`,
          { timeoutMs: 60_000 },
        );
        if (!cancelled) {
          setLayers(res?.data ?? (res as unknown as MapLayersPayload));
          setLayerError(null);
        }
      } catch {
        if (!cancelled) {
          setLayers(null);
          setLayerError("Could not load saved zone layers. You can still draw and save a new shape.");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [zoneId, zoneVersion, layersVersion]);

  const handleMapReady = useCallback((map: mapboxgl.Map) => {
    setMapReady(true);

    // Fit to geometry
    const geom = geometryGeojson as GeoJSON.Geometry | null;
    if (geom && (geom.type === "Polygon" || geom.type === "MultiPolygon")) {
      fitToGeometry(map, geom);
    }

    // Init draw control
    (async () => {
      const [drawModule] = await Promise.all([
        import("@mapbox/mapbox-gl-draw"),
        import("@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css"),
      ]);
      const DrawClass = drawModule.default;
      const draw = new DrawClass({
        displayControlsDefault: false,
        defaultMode: "simple_select",
      });
      map.addControl(draw as unknown as mapboxgl.IControl, "top-left");
      drawRef.current = draw;

      map.on("draw.create", (e: { features: GeoJSON.Feature[] }) => {
        const feature = e.features[0];
        const geom = feature?.geometry;
        if (!geom || geom.type !== "Polygon") {
          adminToast.error("Draw one closed polygon area.");
          try { draw.deleteAll(); } catch { /* ignore */ }
          setDrawIntent("none");
          return;
        }
        setPendingGeom(geom as GeoJSON.Polygon);
        setConfirmOpen(true);
      });
    })();
  }, [geometryGeojson]);

  // Render preview layers
  useEffect(() => {
    const map = mapHandleRef.current?.getMap();
    if (!map || !mapReady) return;
    if (!map.isStyleLoaded()) return;

    const remove = (ids: string[], srcs: string[]) => {
      for (const id of ids) { if (map.getLayer(id)) map.removeLayer(id); }
      for (const id of srcs) { if (map.getSource(id)) map.removeSource(id); }
    };
    remove(
      [COV_LINE, COV_FILL, EXC_LINE, EXC_FILL, INC_LINE, INC_FILL],
      [COV_SRC, EXC_SRC, INC_SRC],
    );

    if (!layers) return;

    const addPoly = (
      src: string, fill: string, line: string,
      geom: unknown,
      fillColor: string, fillOpacity: number,
      lineColor: string,
    ) => {
      const f = asFeature(geom);
      if (!f) return;
      map.addSource(src, { type: "geojson", data: f });
      map.addLayer({ id: fill, type: "fill", source: src, paint: { "fill-color": fillColor, "fill-opacity": fillOpacity } });
      map.addLayer({ id: line, type: "line", source: src, paint: { "line-color": lineColor, "line-width": 2, "line-opacity": 0.95 } });
    };

    addPoly(INC_SRC, INC_FILL, INC_LINE, layers.inclusion_geometry, "#0369a1", 0.3, "#0c4a6e");
    addPoly(EXC_SRC, EXC_FILL, EXC_LINE, layers.exclusion_geometry, "#e11d48", 0.4, "#9f1239");
    addPoly(COV_SRC, COV_FILL, COV_LINE, layers.coverage_geometry, "#047857", 0.25, "#064e3b");
  }, [layers, mapReady]);

  // Sync draw mode
  useEffect(() => {
    const draw = drawRef.current;
    if (!draw || !mapReady) return;
    try {
      if (drawIntent === "none") {
        draw.changeMode("simple_select");
        if (!confirmOpen) draw.deleteAll();
      } else if (!confirmOpen) {
        draw.changeMode("draw_polygon");
      }
    } catch { /* ignore */ }
  }, [drawIntent, mapReady, confirmOpen]);

  const cancelDraw = useCallback(() => {
    setDrawIntent("none");
    setConfirmOpen(false);
    setPendingGeom(null);
    try {
      drawRef.current?.deleteAll();
      drawRef.current?.changeMode("simple_select");
    } catch { /* ignore */ }
  }, []);

  const handleConfirm = async () => {
    if (!pendingGeom) { cancelDraw(); return; }
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

  const intentLabel = drawIntentRef.current === "include" ? "inclusion" : "exclusion";

  return (
    <div className="relative">
      <AdminMapContainer ref={mapHandleRef} onMapReady={handleMapReady} className={className} />

      {/* Legend */}
      {mapReady && (
        <div className="absolute left-3 top-3 z-10 w-48 rounded-xl border border-gray-200 bg-white/95 px-3 py-2.5 text-[11px] shadow-md backdrop-blur-sm">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Layers</p>
          <ul className="mt-1.5 space-y-1">
            <LegendItem color="rgba(3,105,161,0.55)" border="rgba(12,74,110,0.4)" label="Included" />
            <LegendItem color="rgba(225,29,72,0.55)" border="rgba(159,18,57,0.35)" label="Excluded" />
            <LegendItem color="rgba(4,120,87,0.35)" border="#064e3b" label="Final coverage" thick />
          </ul>
        </div>
      )}

      {mapReady && layerError ? (
        <div className="absolute right-3 top-3 z-10 max-w-xs rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {layerError}
        </div>
      ) : null}

      {/* Toolbar */}
      {mapReady && allowEdits && (
        <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-2">
          {drawIntent !== "none" && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-center text-xs font-medium text-amber-950 shadow-md">
              Drawing {drawIntent === "include" ? "included" : "excluded"} area.{" "}
              Click the map to add corners. <strong>Double-click</strong> to finish.
            </div>
          )}
          <div className="flex gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-lg">
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

      {/* Confirm dialog */}
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

function LegendItem({ color, border, label, thick }: { color: string; border: string; label: string; thick?: boolean }) {
  return (
    <li className="flex items-center gap-2">
      <span
        className="h-3 w-3 shrink-0 rounded-sm"
        style={{
          backgroundColor: color,
          border: thick ? `2px solid ${border}` : `1px solid ${border}`,
        }}
      />
      <span className="text-gray-800">{label}</span>
    </li>
  );
}
