"use client";

import React, { useEffect, useState } from "react";
import { fetchMapboxPublicMapConfig } from "@/lib/mapbox/fetch-public-map-config";

const DEFAULT_CENTER = { latitude: 25.2775, longitude: 55.2978 }; // Downtown Dubai

export default function Location() {
  const [mapImageUrl, setMapImageUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await fetchMapboxPublicMapConfig();
        const token = cfg.accessToken;
        const styleUrl = cfg.styleUrl;
        if (cancelled || !token) return;
        const stylePath = styleUrl
          ? (styleUrl.match(/mapbox:\/\/styles\/(.+)/)?.[1] ?? "mapbox/streets-v12")
          : "mapbox/streets-v12";
        const pin = `pin-l+FF0077(${DEFAULT_CENTER.longitude},${DEFAULT_CENTER.latitude})`;
        const centerStr = `${DEFAULT_CENTER.longitude},${DEFAULT_CENTER.latitude},12`;
        setMapImageUrl(
          `https://api.mapbox.com/styles/v1/${stylePath}/static/${pin}/${centerStr}/800x400@2x?access_token=${token}`
        );
      } catch {
        if (!cancelled) setMapImageUrl(null);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="container">
      <div className="border-b pb-20 mb-9">
        <div>
          <h2 className="text-[22px] font-normal text-secondary mb-5">
            Where you&apos;ll be
          </h2>
          <p className="text-base font-normal text-secondary mb-6">
            Downtown Dubai, United Arab Emirates
          </p>
        </div>
        <div className="map-container rounded-lg overflow-hidden border">
          {mapImageUrl ? (
            <img
              src={mapImageUrl}
              alt="Location map"
              className="w-full h-[400px] object-cover"
              width={800}
              height={400}
            />
          ) : (
            <div className="w-full h-[400px] bg-gray-100 flex items-center justify-center text-gray-500">
              Map unavailable
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
