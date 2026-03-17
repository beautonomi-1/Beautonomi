"use client";

import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

export type MapCoordinate = { longitude: number; latitude: number };
export type MapCoordinates =
  | MapCoordinate
  | MapCoordinate[];

interface ServiceZoneMapProps {
  type: "radius" | "polygon";
  coordinates: MapCoordinates | null | undefined;
  radiusKm?: number;
  onCoordinatesChange: (coordinates: MapCoordinate | MapCoordinate[]) => void;
}

export default function ServiceZoneMap({
  type,
  coordinates,
  radiusKm,
  onCoordinatesChange,
}: ServiceZoneMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [publicToken, setPublicToken] = useState<string>("");
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const circleRef = useRef<boolean>(false);
  const polygonRef = useRef<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const envToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
        if (envToken && !cancelled) setPublicToken(envToken);
        else if (!envToken) console.warn("NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN not set. Please configure it in your .env file.");
      } catch {
        console.error("Error loading Mapbox token");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (publicToken && mapContainer.current && !map.current) {
      initializeMap();
    }
  }, [publicToken]);

  useEffect(() => {
    if (map.current && mapLoaded) {
      updateMap();
    }
  }, [type, coordinates, radiusKm, mapLoaded]);

  const initializeMap = () => {
    if (!mapContainer.current || !publicToken) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      accessToken: publicToken,
      style: "mapbox://styles/mapbox/streets-v12",
      center: coordinates && type === "radius" && !Array.isArray(coordinates) && coordinates.longitude != null
        ? [coordinates.longitude, coordinates.latitude]
        : [28.0473, -26.2041], // Default to Johannesburg
      zoom: 12,
    });

    map.current.on("load", () => {
      setMapLoaded(true);
    });

    map.current.on("click", (e) => {
      if (type === "radius") {
        const newCoords = { longitude: e.lngLat.lng, latitude: e.lngLat.lat };
        onCoordinatesChange(newCoords);
      } else if (type === "polygon") {
        const newCoords = Array.isArray(coordinates) ? [...coordinates] : [];
        newCoords.push({ longitude: e.lngLat.lng, latitude: e.lngLat.lat });
        onCoordinatesChange(newCoords);
      }
    });
  };

  const updateMap = () => {
    if (!map.current) return;

    // Remove existing markers/shapes
    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }

    const center = type === "radius" && coordinates && !Array.isArray(coordinates) ? coordinates : null;
    if (center && center.longitude != null && center.latitude != null) {
      // Add marker
      markerRef.current = new mapboxgl.Marker()
        .setLngLat([center.longitude, center.latitude])
        .addTo(map.current);

      if (circleRef.current) {
        const source = map.current.getSource("circle") as mapboxgl.GeoJSONSource | undefined;
        source?.setData({
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [
              generateCircle(
                center.longitude,
                center.latitude,
                (radiusKm || 5) * 1000 // Convert km to meters
              ),
            ],
          },
        });
      } else {
        map.current.addSource("circle", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: {
              type: "Polygon",
              coordinates: [
                generateCircle(
                  center.longitude,
                  center.latitude,
                  (radiusKm || 5) * 1000
                ),
              ],
            },
          },
        });

        map.current.addLayer({
          id: "circle-fill",
          type: "fill",
          source: "circle",
          paint: {
            "fill-color": "#3b82f6",
            "fill-opacity": 0.2,
          },
        });

        map.current.addLayer({
          id: "circle-stroke",
          type: "line",
          source: "circle",
          paint: {
            "line-color": "#3b82f6",
            "line-width": 2,
          },
        });
        circleRef.current = true;
      }

      map.current.flyTo({
        center: [center.longitude, center.latitude],
        zoom: Math.max(10, 15 - Math.log10(radiusKm || 5)),
      });
    } else if (type === "polygon" && Array.isArray(coordinates) && coordinates.length > 0) {
      const polygonCoords = coordinates.map((c: MapCoordinate) => [c.longitude, c.latitude]);
      polygonCoords.push(polygonCoords[0]);

      if (polygonRef.current) {
        const source = map.current.getSource("polygon") as mapboxgl.GeoJSONSource | undefined;
        source?.setData({
            type: "Feature",
            properties: {},
            geometry: {
              type: "Polygon",
              coordinates: [polygonCoords],
            },
          });
      } else {
        map.current.addSource("polygon", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: {
              type: "Polygon",
              coordinates: [polygonCoords],
            },
          },
        });

        map.current.addLayer({
          id: "polygon-fill",
          type: "fill",
          source: "polygon",
          paint: {
            "fill-color": "#3b82f6",
            "fill-opacity": 0.2,
          },
        });

        map.current.addLayer({
          id: "polygon-stroke",
          type: "line",
          source: "polygon",
          paint: {
            "line-color": "#3b82f6",
            "line-width": 2,
          },
        });
        polygonRef.current = true;
      }

      coordinates.forEach((coord: MapCoordinate, index: number) => {
        new mapboxgl.Marker({ color: "#3b82f6" })
          .setLngLat([coord.longitude, coord.latitude])
          .setPopup(new mapboxgl.Popup().setText(`Point ${index + 1}`))
          .addTo(map.current!);
      });

      if (coordinates.length >= 3) {
        const bounds = new mapboxgl.LngLatBounds();
        coordinates.forEach((coord: MapCoordinate) => {
          bounds.extend([coord.longitude, coord.latitude]);
        });
        map.current.fitBounds(bounds, { padding: 50 });
      }
    }
  };

  const generateCircle = (lng: number, lat: number, radiusMeters: number): [number, number][] => {
    const points = 64;
    const circle: [number, number][] = [];
    for (let i = 0; i <= points; i++) {
      const angle = (i / points) * 2 * Math.PI;
      const dx = (radiusMeters / 111320) * Math.cos(angle); // Rough conversion
      const dy = (radiusMeters / 111320) * Math.sin(angle);
      circle.push([lng + dx, lat + dy]);
    }
    return circle;
  };

  if (!publicToken) {
    return (
      <div className="w-full h-96 bg-gray-100 rounded-lg flex items-center justify-center">
        <p className="text-gray-500">Loading Mapbox configuration...</p>
      </div>
    );
  }

  return (
    <div className="w-full h-96 rounded-lg overflow-hidden border">
      <div ref={mapContainer} className="w-full h-full" />
      <div className="mt-2 text-xs text-gray-500">
        {type === "radius"
          ? "Click on the map to set the center point"
          : "Click on the map to add polygon points"}
      </div>
    </div>
  );
}
