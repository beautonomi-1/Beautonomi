"use client";

import React, { useState, useEffect } from "react";
import { getDirectionsUrl, getDirectionsUrlSync, Coordinates } from "@/lib/directions/get-directions-url";
import { cn } from "@/lib/utils";

interface DirectionsLinkProps {
  destination: Coordinates;
  address?: string;
  className?: string;
  children?: React.ReactNode;
}

/**
 * DirectionsLink Component
 * 
 * A link that opens directions to a destination, using the platform-configured
 * map provider (Mapbox or Google Maps as fallback).
 * 
 * Usage:
 * <DirectionsLink 
 *   destination={{ latitude: -26.123, longitude: 28.567 }}
 *   address="123 Main St, Johannesburg"
 * >
 *   Get Directions →
 * </DirectionsLink>
 */
export function DirectionsLink({
  destination,
  address,
  className,
  children = "Get Directions →",
}: DirectionsLinkProps) {
  // Start with a sync fallback URL
  const [directionsUrl, setDirectionsUrl] = useState<string>(() => 
    getDirectionsUrlSync(destination, address)
  );

  useEffect(() => {
    // Load the proper async URL based on platform configuration
    let mounted = true;
    
    getDirectionsUrl(destination, address)
      .then((url) => {
        if (mounted) {
          setDirectionsUrl(url);
        }
      })
      .catch((error) => {
        console.error("Failed to get directions URL:", error);
        // Keep the fallback URL
      });

    return () => {
      mounted = false;
    };
  }, [destination.latitude, destination.longitude, address]);

  return (
    <a
      href={directionsUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "text-blue-600 hover:text-blue-800 font-medium transition-colors",
        className
      )}
    >
      {children}
    </a>
  );
}
