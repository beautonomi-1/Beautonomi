"use client";

import React, { useEffect, useState } from "react";
import { useGPSTracking } from "@/hooks/useGPSTracking";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MapPin, Navigation, AlertCircle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ProviderLocationTrackerProps {
  bookingId: string;
  destination?: {
    latitude: number;
    longitude: number;
  };
  onLocationUpdate?: (location: { latitude: number; longitude: number }) => void;
  autoStart?: boolean;
}

export default function ProviderLocationTracker({
  bookingId,
  destination,
  onLocationUpdate,
  autoStart = false,
}: ProviderLocationTrackerProps) {
  const {
    location,
    isTracking,
    isGPSAvailable,
    isEstimated,
    error,
    startTracking,
    stopTracking,
    estimateLocation,
  } = useGPSTracking({
    bookingId,
    enabled: autoStart,
    updateInterval: 10000, // 10 seconds
    fallbackToEstimated: true,
    onLocationUpdate: (loc) => {
      if (onLocationUpdate) {
        onLocationUpdate({ latitude: loc.latitude, longitude: loc.longitude });
      }
    },
  });

  const [distance, setDistance] = useState<number | null>(null);
  const [eta, setEta] = useState<number | null>(null);

  // Calculate distance and ETA to destination
  useEffect(() => {
    if (location && destination && !isEstimated) {
      const R = 6371; // Earth's radius in km
      const dLat = ((destination.latitude - location.latitude) * Math.PI) / 180;
      const dLon = ((destination.longitude - location.longitude) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((location.latitude * Math.PI) / 180) *
          Math.cos((destination.latitude * Math.PI) / 180) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const calculatedDistance = R * c;
      const estimatedMinutes = Math.ceil((calculatedDistance / 40) * 60);
      queueMicrotask(() => {
        setDistance(calculatedDistance);
        setEta(estimatedMinutes);
      });
    } else {
      queueMicrotask(() => {
        setDistance(null);
        setEta(null);
      });
    }
  }, [location, destination, isEstimated]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin className="w-5 h-5 text-[#FF0077]" />
          <h3 className="font-semibold">Location Tracking</h3>
        </div>
        <div className="flex items-center gap-2">
          {isTracking ? (
            <>
              <Badge variant={isEstimated ? "secondary" : "default"}>
                {isEstimated ? "Estimated" : "Live"}
              </Badge>
              <Button variant="outline" size="sm" onClick={stopTracking}>
                Stop
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              onClick={startTracking}
              className="bg-[#FF0077] hover:bg-[#D60565]"
            >
              <Navigation className="w-4 h-4 mr-2" />
              Start Tracking
            </Button>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="w-4 h-4" />
          <AlertDescription>
            {error.message}
            {isGPSAvailable === false && (
              <Button
                variant="link"
                size="sm"
                className="ml-2"
                onClick={() => estimateLocation("gps_unavailable")}
              >
                Use Estimated Location
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {isEstimated && (
        <Alert>
          <AlertCircle className="w-4 h-4" />
          <AlertDescription>
            GPS unavailable. Using estimated location based on last known position.
          </AlertDescription>
        </Alert>
      )}

      {location && (
        <div className="bg-gray-50 rounded-lg p-4 space-y-2">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-600">Latitude</p>
              <p className="font-mono text-sm">{location.latitude.toFixed(6)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-600">Longitude</p>
              <p className="font-mono text-sm">{location.longitude.toFixed(6)}</p>
            </div>
            {location.accuracy && (
              <div>
                <p className="text-xs text-gray-600">Accuracy</p>
                <p className="text-sm">{Math.round(location.accuracy)}m</p>
              </div>
            )}
            {distance !== null && (
              <div>
                <p className="text-xs text-gray-600">Distance to Destination</p>
                <p className="text-sm font-semibold">
                  {distance < 1
                    ? `${Math.round(distance * 1000)}m`
                    : `${distance.toFixed(2)}km`}
                </p>
              </div>
            )}
            {eta !== null && (
              <div>
                <p className="text-xs text-gray-600">Estimated Arrival</p>
                <p className="text-sm font-semibold">{eta} minutes</p>
              </div>
            )}
          </div>
        </div>
      )}

      {isTracking && !location && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-[#FF0077]" />
          <span className="ml-2 text-sm text-gray-600">Getting location...</span>
        </div>
      )}

      {!isTracking && !location && (
        <p className="text-sm text-gray-500 text-center py-4">
          Click "Start Tracking" to begin sharing your location
        </p>
      )}
    </div>
  );
}
