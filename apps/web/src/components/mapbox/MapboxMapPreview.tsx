"use client";

import React, { useEffect, useRef } from "react";
import { MapPin } from "lucide-react";

const DEFAULT_STYLE = "mapbox://styles/mapbox/streets-v12";

interface MapboxMapPreviewProps {
  latitude: number;
  longitude: number;
  accessToken: string;
  styleUrl?: string | null;
  className?: string;
}

/**
 * Renders a Mapbox map centered on the given coordinates with a location marker.
 * Requires mapbox-gl to be loaded (dynamic import to avoid SSR issues).
 */
export default function MapboxMapPreview({
  latitude,
  longitude,
  accessToken,
  styleUrl,
  className = "",
}: MapboxMapPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current || !accessToken || typeof window === "undefined") return;

    let cancelled = false;

    const init = async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      await import("mapbox-gl/dist/mapbox-gl.css");

      if (cancelled || !containerRef.current) return;

      mapboxgl.accessToken = accessToken;
      const style = styleUrl?.trim() || DEFAULT_STYLE;

      const map = new mapboxgl.Map({
        container: containerRef.current,
        style,
        center: [longitude, latitude],
        zoom: 14,
      });

      if (cancelled) {
        map.remove();
        return;
      }

      const marker = new mapboxgl.Marker({ color: "#FF007F" })
        .setLngLat([longitude, latitude])
        .addTo(map);

      mapRef.current = map;
      markerRef.current = marker;
    };

    init();

    return () => {
      cancelled = true;
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [latitude, longitude, accessToken, styleUrl]);

  return <div ref={containerRef} className={className} style={{ width: "100%", height: "100%", minHeight: 200 }} />;
}

interface MapboxMapPreviewUnavailableProps {
  placeName?: string;
  addressLine1?: string;
  city?: string;
  className?: string;
}

export function MapboxMapPreviewUnavailable({
  placeName,
  addressLine1,
  city,
  className = "",
}: MapboxMapPreviewUnavailableProps) {
  return (
    <div
      className={`flex items-center justify-center bg-gray-100 text-gray-500 ${className}`}
      style={{ minHeight: 200 }}
    >
      <div className="text-center p-4">
        <MapPin className="h-12 w-12 mx-auto mb-2 text-gray-400" />
        <p className="text-sm">Map preview unavailable</p>
        <p className="text-xs mt-1">{placeName || (addressLine1 && city ? `${addressLine1}, ${city}` : addressLine1 || city || "")}</p>
      </div>
    </div>
  );
}
