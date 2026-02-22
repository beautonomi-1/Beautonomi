"use client";

import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

interface ServiceZoneMapProps {
  type: "radius" | "polygon";
  coordinates: any;
  radiusKm?: number;
  onCoordinatesChange: (coordinates: any) => void;
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
  const circleRef = useRef<any>(null);
  const polygonRef = useRef<any>(null);

  const loadMapboxToken = async () => {
    try {
      const envToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
      if (envToken) {
        setPublicToken(envToken);
        return;
      }
      console.warn("NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN not set. Please configure it in your .env file.");
    } catch {
      console.error("Error loading Mapbox token");
    }
  };

  useEffect(() => {
    loadMapboxToken();
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
      center: coordinates && type === "radius" && coordinates.longitude
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

    if (type === "radius" && coordinates && coordinates.longitude && coordinates.latitude) {
      // Add marker
      markerRef.current = new mapboxgl.Marker()
        .setLngLat([coordinates.longitude, coordinates.latitude])
        .addTo(map.current);

      // Add circle (approximate)
      if (circleRef.current) {
        map.current.getSource("circle") && (map.current.getSource("circle") as any).setData({
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [
              generateCircle(
                coordinates.longitude,
                coordinates.latitude,
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
                  coordinates.longitude,
                  coordinates.latitude,
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
      }

      map.current.flyTo({
        center: [coordinates.longitude, coordinates.latitude],
        zoom: Math.max(10, 15 - Math.log10(radiusKm || 5)),
      });
    } else if (type === "polygon" && Array.isArray(coordinates) && coordinates.length > 0) {
      const polygonCoords = coordinates.map((c: any) => [c.longitude, c.latitude]);
      polygonCoords.push(polygonCoords[0]); // Close the polygon

      if (polygonRef.current) {
        map.current.getSource("polygon") &&
          (map.current.getSource("polygon") as any).setData({
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
      }

      // Add markers for each point
      coordinates.forEach((coord: any, index: number) => {
        new mapboxgl.Marker({ color: "#3b82f6" })
          .setLngLat([coord.longitude, coord.latitude])
          .setPopup(new mapboxgl.Popup().setText(`Point ${index + 1}`))
          .addTo(map.current!);
      });

      // Fit bounds
      if (coordinates.length >= 3) {
        const bounds = new mapboxgl.LngLatBounds();
        coordinates.forEach((coord: any) => {
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
