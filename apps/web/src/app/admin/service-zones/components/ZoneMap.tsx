"use client";

import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { ZoneDetail } from "../page";

const DEFAULT_CENTER: [number, number] = [18.4241, -33.9249];
const DEFAULT_ZOOM = 10;

interface ZoneMapProps {
  zone: ZoneDetail | null;
  loading: boolean;
  className?: string;
}

export default function ZoneMap({ zone, loading, className = "" }: ZoneMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const token = typeof window !== "undefined" ? process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN : undefined;

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
    if (!map || !mapReady) return;

    const sourceId = "zone-geometry";
    const layerIdFill = "zone-fill";
    const layerIdLine = "zone-line";

    if (map.getLayer(layerIdLine)) map.removeLayer(layerIdLine);
    if (map.getLayer(layerIdFill)) map.removeLayer(layerIdFill);
    if (map.getSource(sourceId)) map.removeSource(sourceId);

    const geojson = zone?.geometry_geojson;
    if (geojson && (geojson.type === "Polygon" || geojson.type === "MultiPolygon")) {
      const feature: GeoJSON.Feature = {
        type: "Feature",
        properties: {},
        geometry: geojson as GeoJSON.Polygon | GeoJSON.MultiPolygon,
      };
      map.addSource(sourceId, { type: "geojson", data: feature });
      map.addLayer({
        id: layerIdFill,
        type: "fill",
        source: sourceId,
        paint: { "fill-color": "#FF0077", "fill-opacity": 0.25 },
      });
      map.addLayer({
        id: layerIdLine,
        type: "line",
        source: sourceId,
        paint: { "line-color": "#FF0077", "line-width": 2 },
      });

      const bbox = zone?.bbox;
      if (bbox && typeof bbox === "object" && !Array.isArray(bbox) && "minLng" in bbox) {
        const { minLng, minLat, maxLng, maxLat } = bbox;
        map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 40, maxZoom: 14 });
      } else if (Array.isArray(bbox) && bbox.length >= 4) {
        const [w, s, e, n] = bbox;
        map.fitBounds([[w, s], [e, n]], { padding: 40, maxZoom: 14 });
      } else {
        const coords = (geojson as { coordinates: number[][][] | number[][][][] }).coordinates;
        if (coords?.length) {
          const flat = (geojson as { type: string }).type === "MultiPolygon"
            ? (coords as number[][][][]).flat(2)
            : (coords as number[][][])[0] ?? [];
          if (flat.length) {
            const lngs = flat.map((c) => c[0]);
            const lats = flat.map((c) => c[1]);
            map.fitBounds(
              [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
              { padding: 40, maxZoom: 14 }
            );
          }
        }
      }
    } else if (zone?.country_code) {
      map.flyTo({ center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM });
    }
  }, [zone?.id, zone?.geometry_geojson, zone?.bbox, zone?.country_code, mapReady]);

  if (!token) {
    return (
      <div className={`bg-gray-100 rounded-lg flex items-center justify-center ${className}`}>
        <p className="text-gray-500 text-sm">Set NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN for the map</p>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <div ref={containerRef} className="w-full h-full rounded-r-lg" />
      {loading && (
        <div className="absolute top-2 left-2 bg-white/90 px-2 py-1 rounded text-xs text-gray-600 shadow">
          Loading zone...
        </div>
      )}
    </div>
  );
}
