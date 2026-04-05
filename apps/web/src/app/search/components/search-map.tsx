"use client";

import React, { useState, useRef, useEffect } from "react";
import Image from "next/image";
import type mapboxgl from "mapbox-gl";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { fetchMapboxPublicMapConfig } from "@/lib/mapbox/fetch-public-map-config";

function createPriceMarker(price: number): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "custom-price-marker";
  el.style.backgroundColor = "white";
  el.style.borderRadius = "50%";
  el.style.padding = "5px 10px";
  el.style.fontWeight = "bold";
  el.style.boxShadow = "0 2px 5px rgba(0,0,0,0.2)";
  el.textContent = `$${price}`;
  return el;
}

interface Listing {
  id: number;
  lat: number;
  lng: number;
  price: number;
  title: string;
  host: string;
  description: string;
  image: string;
}

const listings: Listing[] = [
  {
    id: 1,
    lat: 51.5074,
    lng: -0.1278,
    price: 82,
    title: "Room in London, UK",
    host: "Moza Mostafa",
    description: "Private room with Balcony & view",
    image: "/api/placeholder/400/300",
  },
];

const SearchMap: React.FC = () => {
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    let cancelled = false;

    (async () => {
      const [{ accessToken, styleUrl }, mapboxModule] = await Promise.all([
        fetchMapboxPublicMapConfig(),
        import("mapbox-gl"),
      ]);
      await import("mapbox-gl/dist/mapbox-gl.css");
      const mb = mapboxModule.default;
      if (cancelled || !mapContainerRef.current || !accessToken) return;

      mb.accessToken = accessToken;

      const map = new mb.Map({
        container: mapContainerRef.current,
        style: styleUrl?.trim() || "mapbox://styles/mapbox/light-v11",
        center: [-0.1278, 51.5074],
        zoom: 13,
      });

      map.addControl(new mb.NavigationControl(), "top-right");

      markersRef.current = listings.map((listing) => {
        const el = createPriceMarker(listing.price);
        const marker = new mb.Marker({ element: el })
          .setLngLat([listing.lng, listing.lat])
          .addTo(map);
        el.addEventListener("click", () => {
          setSelectedListing(listing);
          map.flyTo({ center: [listing.lng, listing.lat], zoom: 15, duration: 500 });
        });
        return marker;
      });

      if (cancelled) {
        markersRef.current.forEach((m) => m.remove());
        markersRef.current = [];
        map.remove();
        return;
      }
      mapRef.current = map;
    })();

    return () => {
      cancelled = true;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div className="relative h-screen w-full">
      <div ref={mapContainerRef} className="h-full w-full" />
      {selectedListing && (
        <div className="absolute bottom-10 left-1/2 z-[1000] w-80 -translate-x-1/2 transform">
          <Card className="bg-white shadow-lg">
            <CardHeader className="p-4">
              <h3 className="text-lg font-semibold">{selectedListing.title}</h3>
            </CardHeader>
            <CardContent className="p-4">
              <div className="relative mb-4 h-40 w-full">
                <Image
                  src={selectedListing.image}
                  alt={selectedListing.title}
                  fill
                  sizes="320px"
                  className="rounded object-cover"
                />
              </div>
              <p className="mb-2 text-sm">Stay with {selectedListing.host}</p>
              <p className="mb-4 text-sm">{selectedListing.description}</p>
              <p className="text-lg font-bold">${selectedListing.price} / night</p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default SearchMap;
