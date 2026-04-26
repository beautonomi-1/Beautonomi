"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import type { Map, Marker, IControl, MapLayerMouseEvent } from "mapbox-gl";
import type MapboxDrawType from "@mapbox/mapbox-gl-draw";
import { fetchMapboxPublicMapConfig } from "@/lib/mapbox/fetch-public-map-config";
import { fetcher } from "@/lib/http/fetcher";
import { FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { PlatformMarketDetail, PlatformMarketListItem } from "../lib/platform-types";
import { fitBoundsCornersFromPolygonLike } from "@/lib/service-zones/geoLngLatExtents";

const DEFAULT_CENTER: [number, number] = [18.4241, -33.9249];
const DEFAULT_ZOOM = 10;
const DEFAULT_STYLE = "mapbox://styles/mapbox/streets-v12";

// Overview layer IDs
const OV_SOURCE = "ov-src";
const OV_FILL = "ov-fill";
const OV_LINE = "ov-line";
// Preview layer IDs
const INC_SOURCE = "inc-src";
const INC_FILL = "inc-fill";
const INC_LINE = "inc-line";
const EXC_SOURCE = "exc-src";
const EXC_FILL = "exc-fill";
const EXC_LINE = "exc-line";
const COV_SOURCE = "cov-src";
const COV_FILL = "cov-fill";
const COV_LINE = "cov-line";

function formatFetchError(e: unknown, fallback: string): string {
  if (!(e instanceof FetchError)) return e instanceof Error ? e.message : fallback;
  return e.details ? `${e.message}: ${JSON.stringify(e.details)}` : e.message;
}

function asGeomFeature(g: unknown): GeoJSON.Feature | null {
  if (!g || typeof g !== "object") return null;
  const o = g as { type?: string; coordinates?: unknown };
  if (o.type !== "Polygon" && o.type !== "MultiPolygon") return null;
  return {
    type: "Feature",
    properties: {},
    geometry: o as GeoJSON.Polygon | GeoJSON.MultiPolygon,
  };
}

/** Build a GeoJSON Polygon from a bbox [minLng, minLat, maxLng, maxLat] or object form */
function bboxToPolygon(bbox: PlatformMarketListItem["bbox"]): GeoJSON.Feature<GeoJSON.Polygon> | null {
  if (!bbox) return null;
  let minLng: number, minLat: number, maxLng: number, maxLat: number;
  if (Array.isArray(bbox) && bbox.length >= 4) {
    [minLng, minLat, maxLng, maxLat] = bbox as [number, number, number, number];
  } else if (typeof bbox === "object" && "minLng" in bbox) {
    ({ minLng, minLat, maxLng, maxLat } = bbox as { minLng: number; minLat: number; maxLng: number; maxLat: number });
  } else {
    return null;
  }
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [minLng, minLat],
          [maxLng, minLat],
          [maxLng, maxLat],
          [minLng, maxLat],
          [minLng, minLat],
        ],
      ],
    },
  };
}

type MapLayersPayload = {
  inclusion_geometry: { type: string; coordinates: unknown } | null;
  exclusion_geometry: { type: string; coordinates: unknown } | null;
  coverage_geometry: { type: string; coordinates: unknown } | null;
};

export type MapJumpTarget = { lng: number; lat: number; nonce: number };

type LayerVisibility = { inclusions: boolean; exclusions: boolean; coverage: boolean };
type DrawIntent = "none" | "exclude" | "include";

interface MarketMapProps {
  markets?: PlatformMarketListItem[];
  market: PlatformMarketDetail | null;
  loading: boolean;
  className?: string;
  onCoverageUpdated?: () => void;
  allowEdits?: boolean;
  mapJump?: MapJumpTarget | null;
  /** Called when user clicks a market bbox in overview mode */
  onMarketSelect?: (id: string) => void;
}

export default function MarketMap({
  markets = [],
  market,
  loading,
  className = "",
  onCoverageUpdated,
  allowEdits = true,
  mapJump,
  onMarketSelect,
}: MarketMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const mapboxLibRef = useRef<typeof import("mapbox-gl").default | null>(null);
  const drawRef = useRef<InstanceType<typeof MapboxDrawType> | null>(null);
  const drawListenerRef = useRef<((e: { features?: GeoJSON.Feature[] }) => void) | null>(null);
  const fragmentMarkerRef = useRef<Marker | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [styleUrl, setStyleUrl] = useState<string | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [drawIntent, setDrawIntent] = useState<DrawIntent>("none");
  const [savingExclusion, setSavingExclusion] = useState(false);
  const [savingInclusion, setSavingInclusion] = useState(false);
  const [previewLayers, setPreviewLayers] = useState<MapLayersPayload | null>(null);
  const [exclusionDialogOpen, setExclusionDialogOpen] = useState(false);
  const [inclusionDialogOpen, setInclusionDialogOpen] = useState(false);
  const [pendingExclusionGeom, setPendingExclusionGeom] = useState<GeoJSON.Polygon | null>(null);
  const [pendingInclusionGeom, setPendingInclusionGeom] = useState<GeoJSON.Polygon | null>(null);
  const [layerVisibility, setLayerVisibility] = useState<LayerVisibility>({
    inclusions: true,
    exclusions: true,
    coverage: true,
  });

  const marketId = market?.id;
  const marketRef = useRef(market);
  const onCoverageUpdatedRef = useRef(onCoverageUpdated);
  const drawIntentRef = useRef<DrawIntent>("none");

  useEffect(() => {
    marketRef.current = market;
    onCoverageUpdatedRef.current = onCoverageUpdated;
  }, [market, onCoverageUpdated]);

  useEffect(() => {
    drawIntentRef.current = drawIntent;
  }, [drawIntent]);

  // Load Mapbox config
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await fetchMapboxPublicMapConfig();
        if (!cancelled) {
          setAccessToken(cfg.accessToken);
          setStyleUrl(cfg.styleUrl);
        }
      } finally {
        if (!cancelled) setConfigLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Init map (lazy-load mapbox-gl to reduce initial bundle)
  useEffect(() => {
    if (!accessToken || !containerRef.current) return;
    let cancelled = false;
    let ro: ResizeObserver | null = null;
    let createdMap: Map | null = null;

    (async () => {
      const [mapboxModule] = await Promise.all([
        import("mapbox-gl"),
        import("mapbox-gl/dist/mapbox-gl.css"),
      ]);
      const mb = mapboxModule.default;
      mapboxLibRef.current = mb;
      if (cancelled || !containerRef.current) return;

      const map = new mb.Map({
        container: containerRef.current,
        accessToken,
        style: styleUrl?.trim() || DEFAULT_STYLE,
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
      });
      map.addControl(new mb.NavigationControl(), "top-right");
      map.on("load", () => {
        try { map.resize(); } catch { /* ignore */ }
        setMapReady(true);
      });
      mapRef.current = map;
      createdMap = map;

      if (typeof ResizeObserver !== "undefined" && containerRef.current) {
        ro = new ResizeObserver(() => {
          try { mapRef.current?.resize(); } catch { /* ignore */ }
        });
        ro.observe(containerRef.current);
      }
    })();

    return () => {
      cancelled = true;
      ro?.disconnect();
      createdMap?.remove();
      mapRef.current = null;
      mapboxLibRef.current = null;
      setMapReady(false);
    };
  }, [accessToken, styleUrl]);

  // Fetch per-market preview layers
  useEffect(() => {
    if (!marketId) {
      setPreviewLayers(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetcher.get<{ data: MapLayersPayload }>(
          `/api/admin/service-zones/${marketId}/map-layers`
        );
        if (!cancelled) setPreviewLayers(res.data ?? null);
      } catch {
        if (!cancelled) setPreviewLayers(null);
      }
    })();
    return () => { cancelled = true; };
  }, [marketId, market?.version]);

  // Handle mapJump flyTo
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapJump) return;
    map.flyTo({ center: [mapJump.lng, mapJump.lat], zoom: 12, essential: true });
  }, [mapJump]);

  // Init draw control (lazy-load @mapbox/mapbox-gl-draw)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    let cancelled = false;

    (async () => {
      const [drawModule] = await Promise.all([
        import("@mapbox/mapbox-gl-draw"),
        import("@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css"),
      ]);
      const MapboxDraw = drawModule.default;
      if (cancelled || !mapRef.current) return;

      if (!map.isStyleLoaded()) {
        await new Promise<void>((resolve) => {
          const check = () => { if (map.isStyleLoaded()) resolve(); else map.once("styledata", check); };
          check();
        });
      }
      if (cancelled || !mapRef.current) return;

      const draw = new MapboxDraw({
        displayControlsDefault: false,
        defaultMode: "simple_select",
        controls: {
          polygon: true,
          trash: true,
        },
      });
      map.addControl(draw as unknown as IControl, "top-left");
      drawRef.current = draw;
    const onCreate = (e: { features: GeoJSON.Feature[] }) => {
      const feature = e.features[0];
      const geom = feature?.geometry;
      if (!geom || geom.type !== "Polygon") {
        toast.error("Draw one closed polygon area.");
        try { draw.deleteAll(); } catch { /* ignore */ }
        setDrawIntent("none");
        return;
      }
      const m = marketRef.current;
      if (!m?.id) {
        draw.deleteAll();
        setDrawIntent("none");
        return;
      }
      if (drawIntentRef.current === "include") {
        setPendingInclusionGeom(geom);
        setInclusionDialogOpen(true);
      } else {
        setPendingExclusionGeom(geom);
        setExclusionDialogOpen(true);
      }
    };
    const listener = (e: { features?: GeoJSON.Feature[] }) => {
      if (!e?.features?.length) return;
      onCreate({ features: e.features });
    };
    drawListenerRef.current = listener;
    map.on("draw.create", listener);
    })();

    return () => {
      cancelled = true;
      const draw = drawRef.current;
      if (draw && mapRef.current) {
        if (drawListenerRef.current) {
          mapRef.current.off("draw.create", drawListenerRef.current);
        }
        try { mapRef.current.removeControl(draw as unknown as IControl); } catch { /* ignore */ }
      }
      drawRef.current = null;
      drawListenerRef.current = null;
    };
  }, [mapReady]);

  // Sync draw mode
  useEffect(() => {
    const draw = drawRef.current;
    if (!draw || !mapReady) return;
    const anyDialogOpen = exclusionDialogOpen || inclusionDialogOpen;
    try {
      if (drawIntent === "none") {
        draw.changeMode("simple_select");
        if (!anyDialogOpen) draw.deleteAll();
      } else if (!anyDialogOpen) {
        draw.changeMode("draw_polygon");
      }
    } catch { /* ignore */ }
  }, [drawIntent, mapReady, exclusionDialogOpen, inclusionDialogOpen]);

  useEffect(() => {
    if (drawIntent === "none") return;
    const draw = drawRef.current;
    const anyDialogOpen = exclusionDialogOpen || inclusionDialogOpen;
    try {
      if (!anyDialogOpen) {
        draw?.deleteAll();
        draw?.changeMode("draw_polygon");
      }
    } catch { /* ignore */ }
  }, [marketId, drawIntent, exclusionDialogOpen, inclusionDialogOpen]);

  useEffect(() => {
    if (!allowEdits) {
      setDrawIntent("none");
      setExclusionDialogOpen(false);
      setInclusionDialogOpen(false);
      setPendingExclusionGeom(null);
      setPendingInclusionGeom(null);
      try {
        drawRef.current?.deleteAll();
        drawRef.current?.changeMode("simple_select");
      } catch { /* ignore */ }
    }
  }, [allowEdits]);

  // Helper: remove preview layers
  const removePreviewLayers = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const layers = [COV_LINE, COV_FILL, EXC_LINE, EXC_FILL, INC_LINE, INC_FILL];
    const sources = [COV_SOURCE, EXC_SOURCE, INC_SOURCE];
    for (const id of layers) { if (map.getLayer(id)) map.removeLayer(id); }
    for (const id of sources) { if (map.getSource(id)) map.removeSource(id); }
  }, []);

  // Helper: remove overview layer
  const removeOverviewLayer = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getLayer(OV_LINE)) map.removeLayer(OV_LINE);
    if (map.getLayer(OV_FILL)) map.removeLayer(OV_FILL);
    if (map.getSource(OV_SOURCE)) map.removeSource(OV_SOURCE);
  }, []);

  // Helper: remove fragment marker
  const removeFragmentMarker = useCallback(() => {
    if (fragmentMarkerRef.current) {
      fragmentMarkerRef.current.remove();
      fragmentMarkerRef.current = null;
    }
  }, []);

  // Apply layer visibility toggles
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const toggle = (ids: string[], visible: boolean) => {
      const v = visible ? "visible" : "none";
      for (const id of ids) {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", v);
      }
    };
    toggle([INC_FILL, INC_LINE], layerVisibility.inclusions);
    toggle([EXC_FILL, EXC_LINE], layerVisibility.exclusions);
    toggle([COV_FILL, COV_LINE], layerVisibility.coverage);
  }, [layerVisibility, mapReady]);

  // Main effect: render overview or per-market layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const mbLib = mapboxLibRef.current;
    if (!mbLib) return;

    removePreviewLayers();
    removeOverviewLayer();
    removeFragmentMarker();

    // Holds cleanup for overview event listeners so they can be removed on next run
    let overviewCleanupRef: (() => void) | undefined;

    // Overview mode — no market selected
    if (!market) {
      const features: GeoJSON.Feature<GeoJSON.Polygon>[] = [];
      const bounds = new mbLib.LngLatBounds();
      let hasBounds = false;

      for (const z of markets) {
        const f = bboxToPolygon(z.bbox);
        if (!f) continue;
        (f.properties as Record<string, unknown>) = { id: z.id, name: z.name, status: z.status };
        features.push(f);
        const coords = f.geometry.coordinates[0];
        for (const c of coords) {
          bounds.extend(c as [number, number]);
          hasBounds = true;
        }
      }

      if (features.length > 0) {
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

        // Named handlers so they can be removed in cleanup
        const handleClick = (e: MapLayerMouseEvent) => {
          const feat = e.features?.[0];
          const id = feat?.properties?.id as string | undefined;
          if (id) onMarketSelect?.(id);
        };
        const handleMouseEnter = () => { map.getCanvas().style.cursor = "pointer"; };
        const handleMouseLeave = () => { map.getCanvas().style.cursor = ""; };

        map.on("click", OV_FILL, handleClick);
        map.on("mouseenter", OV_FILL, handleMouseEnter);
        map.on("mouseleave", OV_FILL, handleMouseLeave);

        // Store cleanup in a closure-captured variable; returned below
        overviewCleanupRef = () => {
          try {
            map.off("click", OV_FILL, handleClick);
            map.off("mouseenter", OV_FILL, handleMouseEnter);
            map.off("mouseleave", OV_FILL, handleMouseLeave);
            map.getCanvas().style.cursor = "";
          } catch { /* map may already be removed */ }
        };

        if (hasBounds) {
          map.fitBounds(bounds, { padding: 60, maxZoom: 10 });
        }
      }
      return overviewCleanupRef ? overviewCleanupRef : undefined;
    }

    // Per-market mode
    const incF = previewLayers?.inclusion_geometry ? asGeomFeature(previewLayers.inclusion_geometry) : null;
    const excF = previewLayers?.exclusion_geometry ? asGeomFeature(previewLayers.exclusion_geometry) : null;
    let covF = previewLayers?.coverage_geometry != null
      ? asGeomFeature(previewLayers.coverage_geometry)
      : null;
    if (!covF && market.geometry_geojson) {
      covF = asGeomFeature(market.geometry_geojson);
    }

    const vis = (visible: boolean) => (visible ? "visible" : "none") as "visible" | "none";

    if (incF) {
      map.addSource(INC_SOURCE, { type: "geojson", data: incF });
      map.addLayer({
        id: INC_FILL,
        type: "fill",
        source: INC_SOURCE,
        layout: { visibility: vis(layerVisibility.inclusions) },
        paint: { "fill-color": "#0369a1", "fill-opacity": 0.34 },
      });
      map.addLayer({
        id: INC_LINE,
        type: "line",
        source: INC_SOURCE,
        layout: { visibility: vis(layerVisibility.inclusions) },
        paint: { "line-color": "#0c4a6e", "line-width": 2, "line-opacity": 0.95 },
      });
    }
    if (excF) {
      map.addSource(EXC_SOURCE, { type: "geojson", data: excF });
      map.addLayer({
        id: EXC_FILL,
        type: "fill",
        source: EXC_SOURCE,
        layout: { visibility: vis(layerVisibility.exclusions) },
        paint: { "fill-color": "#e11d48", "fill-opacity": 0.42 },
      });
      map.addLayer({
        id: EXC_LINE,
        type: "line",
        source: EXC_SOURCE,
        layout: { visibility: vis(layerVisibility.exclusions) },
        paint: { "line-color": "#9f1239", "line-width": 2, "line-opacity": 0.95 },
      });
    }
    if (covF) {
      map.addSource(COV_SOURCE, { type: "geojson", data: covF });
      map.addLayer({
        id: COV_FILL,
        type: "fill",
        source: COV_SOURCE,
        layout: { visibility: vis(layerVisibility.coverage) },
        paint: { "fill-color": "#047857", "fill-opacity": 0.28 },
      });
      map.addLayer({
        id: COV_LINE,
        type: "line",
        source: COV_SOURCE,
        layout: { visibility: vis(layerVisibility.coverage) },
        paint: { "line-color": "#064e3b", "line-width": 3, "line-opacity": 1 },
      });
    }

    // Fragment warning marker
    if (market.disconnected_fragments && market.centroid) {
      const centroid = market.centroid as { coordinates?: [number, number] } | [number, number] | null;
      let lngLat: [number, number] | null = null;
      if (Array.isArray(centroid) && centroid.length >= 2) {
        lngLat = centroid as [number, number];
      } else if (
        centroid &&
        typeof centroid === "object" &&
        "coordinates" in centroid &&
        Array.isArray(centroid.coordinates) &&
        centroid.coordinates.length >= 2
      ) {
        lngLat = centroid.coordinates;
      }
      if (lngLat) {
        // Build a pulsing orange marker element
        const el = document.createElement("div");
        el.style.cssText = [
          "width:20px;height:20px;border-radius:50%;",
          "background:#f97316;border:2px solid #fff;",
          "box-shadow:0 0 0 0 rgba(249,115,22,0.6);",
          "animation:pulse-ring 1.6s infinite;",
        ].join("");
        if (!document.getElementById("pulse-ring-style")) {
          const style = document.createElement("style");
          style.id = "pulse-ring-style";
          style.textContent = `@keyframes pulse-ring{0%{box-shadow:0 0 0 0 rgba(249,115,22,.6)}70%{box-shadow:0 0 0 10px rgba(249,115,22,0)}100%{box-shadow:0 0 0 0 rgba(249,115,22,0)}}`;
          document.head.appendChild(style);
        }
        const popup = new mbLib.Popup({ offset: 14, closeButton: false })
          .setHTML(
            `<div style="font-size:12px;font-weight:600;color:#431407;max-width:200px">
              Coverage has disconnected parts — review inclusions
            </div>`
          );
        const marker = new mbLib.Marker({ element: el, anchor: "center" })
          .setLngLat(lngLat)
          .setPopup(popup)
          .addTo(map);
        fragmentMarkerRef.current = marker;
      }
    }

    // Fit bounds — prefer union/coverage geometry over bbox (national / legacy radius previews).
    if (covF?.geometry) {
      const g = covF.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon;
      const corners = fitBoundsCornersFromPolygonLike(g);
      if (corners) {
        map.fitBounds(corners, { padding: 48, maxZoom: 13 });
      }
    } else if (market.geometry_geojson) {
      const raw = asGeomFeature(market.geometry_geojson);
      const g = raw?.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon | undefined;
      if (g && (g.type === "Polygon" || g.type === "MultiPolygon")) {
        const corners = fitBoundsCornersFromPolygonLike(g);
        if (corners) {
          map.fitBounds(corners, { padding: 48, maxZoom: 13 });
        }
      }
    } else {
      const bbox = market.bbox;
      if (bbox && typeof bbox === "object" && !Array.isArray(bbox) && "minLng" in bbox) {
        const { minLng, minLat, maxLng, maxLat } = bbox as {
          minLng: number; minLat: number; maxLng: number; maxLat: number;
        };
        map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 48, maxZoom: 13 });
      } else if (Array.isArray(bbox) && bbox.length >= 4) {
        const [w, s, e, n] = bbox;
        map.fitBounds([[w, s], [e, n]], { padding: 48, maxZoom: 13 });
      } else if (market.country_code) {
        map.flyTo({ center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM });
      }
    }

    // Return cleanup for the per-market path (overview path returns its own cleanup above)
    return () => { overviewCleanupRef?.(); };
  }, [
    market?.id,
    market?.bbox,
    market?.country_code,
    market?.geometry_geojson,
    market?.disconnected_fragments,
    market?.centroid,
    markets,
    previewLayers,
    mapReady,
    removePreviewLayers,
    removeOverviewLayer,
    removeFragmentMarker,
    onMarketSelect,
  ]);

  const startDrawExclusion = useCallback(() => {
    if (!market) {
      toast.info("Select a market first");
      return;
    }
    setDrawIntent("exclude");
  }, [market]);

  const startDrawInclusion = useCallback(() => {
    if (!market) {
      toast.info("Select a market first");
      return;
    }
    setDrawIntent("include");
  }, [market]);

  const cancelDraw = useCallback(() => {
    setDrawIntent("none");
    setExclusionDialogOpen(false);
    setInclusionDialogOpen(false);
    setPendingExclusionGeom(null);
    setPendingInclusionGeom(null);
    try {
      drawRef.current?.deleteAll();
      drawRef.current?.changeMode("simple_select");
    } catch { /* ignore */ }
  }, []);

  const confirmExclusion = async () => {
    const m = marketRef.current;
    const geom = pendingExclusionGeom;
    if (!m?.id || !geom) {
      setExclusionDialogOpen(false);
      return;
    }
    try {
      setSavingExclusion(true);
      await fetcher.post(`/api/admin/service-zones/${m.id}/exclude`, {
        type: "custom_polygon",
        geojson: geom,
        version: m.version,
      });
      toast.success("Excluded area added");
      try {
        drawRef.current?.deleteAll();
        drawRef.current?.changeMode("simple_select");
      } catch { /* ignore */ }
      setDrawIntent("none");
      setPendingExclusionGeom(null);
      setExclusionDialogOpen(false);
      onCoverageUpdatedRef.current?.();
    } catch (err) {
      toast.error(formatFetchError(err, "Could not save exclusion"));
    } finally {
      setSavingExclusion(false);
    }
  };

  const cancelExclusionDialog = () => {
    setExclusionDialogOpen(false);
    setPendingExclusionGeom(null);
    try {
      drawRef.current?.deleteAll();
      drawRef.current?.changeMode("simple_select");
    } catch { /* ignore */ }
    setDrawIntent("none");
  };

  const confirmInclusion = async () => {
    const m = marketRef.current;
    const geom = pendingInclusionGeom;
    if (!m?.id || !geom) {
      setInclusionDialogOpen(false);
      return;
    }
    try {
      setSavingInclusion(true);
      const res = await fetcher.post<{
        data?: { included?: number; matched_areas?: number; truncated?: boolean };
      }>(`/api/admin/service-zones/${m.id}/include-drawn`, {
        type: "custom_polygon",
        geojson: geom,
        version: m.version,
      });
      const included = Number(res?.data?.included ?? 0);
      const matched = Number(res?.data?.matched_areas ?? 0);
      const truncated = Boolean(res?.data?.truncated);
      if (included > 0) {
        toast.success(`Included ${included} postal areas from drawn region`);
      } else if (matched > 0) {
        toast.info("All matched postal areas were already included");
      } else {
        toast.info("No dataset postal areas intersect this shape");
      }
      if (truncated) {
        toast.warning("Selection reached include safety cap; draw a smaller area for full coverage");
      }
      try {
        drawRef.current?.deleteAll();
        drawRef.current?.changeMode("simple_select");
      } catch { /* ignore */ }
      setDrawIntent("none");
      setPendingInclusionGeom(null);
      setInclusionDialogOpen(false);
      onCoverageUpdatedRef.current?.();
    } catch (err) {
      toast.error(formatFetchError(err, "Could not save drawn inclusion"));
    } finally {
      setSavingInclusion(false);
    }
  };

  const cancelInclusionDialog = () => {
    setInclusionDialogOpen(false);
    setPendingInclusionGeom(null);
    try {
      drawRef.current?.deleteAll();
      drawRef.current?.changeMode("simple_select");
    } catch { /* ignore */ }
    setDrawIntent("none");
  };

  const toggleLayer = (key: keyof LayerVisibility) => {
    setLayerVisibility((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (configLoading) {
    return (
      <div className={`flex items-center justify-center rounded-xl border border-slate-200 bg-slate-100 ${className}`}>
        <p className="text-sm font-medium text-slate-700">Loading map…</p>
      </div>
    );
  }

  if (!accessToken) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50/90 p-6 text-center ${className}`}
      >
        <p className="text-sm font-semibold text-amber-950">Map preview unavailable</p>
        <p className="max-w-sm text-xs leading-relaxed text-amber-900/90">
          Add a public Mapbox token under{" "}
          <a href="/admin/mapbox" className="text-primary underline">
            Integrations → Mapbox
          </a>{" "}
          or set <code className="text-[11px]">NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN</code> for local dev.
        </p>
      </div>
    );
  }

  const LEGEND_LAYERS: { key: keyof LayerVisibility; label: string; sublabel: string; color: string; border: string }[] = [
    {
      key: "inclusions",
      label: "Included",
      sublabel: "Gross area from dataset",
      color: "rgba(3, 105, 161, 0.55)",
      border: "rgba(12, 74, 110, 0.4)",
    },
    {
      key: "exclusions",
      label: "Excluded",
      sublabel: "Cut out from included",
      color: "rgba(225, 29, 72, 0.55)",
      border: "rgba(159, 18, 57, 0.35)",
    },
    {
      key: "coverage",
      label: "Final coverage",
      sublabel: "What stays live",
      color: "rgba(4, 120, 87, 0.35)",
      border: "#064e3b",
    },
  ];

  return (
    /*
     * Layout strategy: outer wrapper is `flex flex-col` + className (e.g. "min-h-[360px] flex-1").
     * The Mapbox container (containerRef) is the ONLY flex child with `flex-1 min-h-0 w-full`,
     * so it naturally fills all available space without needing `absolute inset-0`.
     *
     * Reason for this change: `absolute inset-0` relies on its `position: relative` parent
     * having a non-zero computed height.  When that height comes solely from `flex-grow` in a
     * nested chain, browsers may resolve it as 0 before layout completes, yielding an invisible
     * canvas.  A normal flex-1 child avoids this race condition entirely — its size is calculated
     * by the flex algorithm as part of the same layout pass.
     *
     * The overlay elements (legend, toolbar, loading badge) are still `position: absolute` and
     * positioned relative to this `relative` outer wrapper, so they continue to work correctly.
     */
    <div className={`relative flex flex-col ${className}`}>
      {/* Mapbox mounts here — flex-1 grows to fill the wrapper naturally */}
      <div
        ref={containerRef}
        className="min-h-0 w-full flex-1 rounded-xl border border-slate-300 bg-slate-200 shadow-inner"
      />

      {/* No Mapbox token — shown instead of a blank gray box */}
      {!configLoading && !accessToken && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-xl bg-slate-100/95 p-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
            <svg className="h-7 w-7 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Map not configured</p>
            <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-slate-600">
              Add a Mapbox access token in{" "}
              <a href="/admin/mapbox" className="font-semibold text-slate-900 underline underline-offset-2">
                Mapbox setup
              </a>{" "}
              to visualise coverage on the map. The builder and dataset search work without it.
            </p>
          </div>
        </div>
      )}

      {loading && (
        <div className="absolute left-3 top-3 z-10 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-md">
          Loading market…
        </div>
      )}

      {/* Overview mode label */}
      {!market && markets.length > 0 && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full border border-slate-300 bg-white/90 px-3 py-1 text-xs font-semibold text-slate-700 shadow-md backdrop-blur-sm">
          Click a market boundary to select it
        </div>
      )}

      {/* Interactive map legend — repositioned for mobile/desktop */}
      <div
        className="absolute left-3 z-10 w-[min(calc(100%-1.5rem),220px)] rounded-xl border border-slate-300 bg-white/95 px-3 py-2.5 text-[11px] leading-snug text-slate-800 shadow-md backdrop-blur-sm
                   bottom-20 sm:bottom-auto sm:top-3"
        aria-label="Map layer controls"
      >
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-600">Layers</p>
        <ul className="mt-2 space-y-1.5">
          {LEGEND_LAYERS.map(({ key, label, sublabel, color, border }) => {
            const active = layerVisibility[key];
            return (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => toggleLayer(key)}
                  className="flex w-full items-start gap-2 rounded-md px-0.5 py-0.5 transition hover:bg-slate-100"
                  title={active ? `Hide ${label}` : `Show ${label}`}
                >
                  <span
                    className="mt-0.5 h-3 w-3 shrink-0 rounded-sm transition-opacity"
                    style={{
                      backgroundColor: color,
                      border: key === "coverage" ? `2px solid ${border}` : `1px solid ${border}`,
                      opacity: active ? 1 : 0.3,
                    }}
                  />
                  <span className={active ? "text-slate-900" : "text-slate-400"}>
                    <span className="font-medium">{label}</span>
                    <span className="block text-[10px] font-normal text-slate-500">{sublabel}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Draw exclusion toolbar */}
      {market && allowEdits && (
        <div className="pointer-events-auto absolute bottom-4 left-1/2 z-10 flex w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 flex-col items-center gap-2 pb-[env(safe-area-inset-bottom,0px)] sm:w-auto sm:pb-0">
          {drawIntent !== "none" && (
            <div className="w-full rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-center text-xs font-medium text-amber-950 shadow-md">
              Drawing {drawIntent === "include" ? "included" : "excluded"} area. Tap the map to add corners, or use the{" "}
              <strong>polygon</strong> / <strong>trash</strong> controls on the map. <strong>Double-click</strong> the last point to finish.
            </div>
          )}
          <div className="flex flex-wrap justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2.5 shadow-lg">
            {drawIntent === "none" ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  disabled={savingExclusion || savingInclusion}
                  onClick={startDrawInclusion}
                >
                  Draw included area
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  disabled={savingExclusion || savingInclusion}
                  onClick={startDrawExclusion}
                >
                  Draw excluded area
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="text-xs"
                  disabled={savingExclusion || savingInclusion}
                >
                  Finish shape on map…
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-xs"
                  disabled={savingExclusion || savingInclusion}
                  onClick={cancelDraw}
                >
                  Cancel
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      <AlertDialog open={exclusionDialogOpen} onOpenChange={(o) => !o && cancelExclusionDialog()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Add excluded area?</AlertDialogTitle>
            <AlertDialogDescription>
              This shape is subtracted from included areas. You can remove it later from the excluded list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={savingExclusion || savingInclusion} onClick={cancelExclusionDialog}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={savingExclusion || savingInclusion}
              className="bg-slate-900 text-white hover:bg-slate-800"
              onClick={(e) => {
                e.preventDefault();
                void confirmExclusion();
              }}
            >
              {savingExclusion ? "Saving…" : "Confirm exclusion"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={inclusionDialogOpen} onOpenChange={(o) => !o && cancelInclusionDialog()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Add included area?</AlertDialogTitle>
            <AlertDialogDescription>
              This shape will auto-include intersecting postal dataset areas and recompute market coverage.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={savingInclusion || savingExclusion} onClick={cancelInclusionDialog}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={savingInclusion || savingExclusion}
              className="bg-slate-900 text-white hover:bg-slate-800"
              onClick={(e) => {
                e.preventDefault();
                void confirmInclusion();
              }}
            >
              {savingInclusion ? "Saving…" : "Confirm inclusion"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
