"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";

interface LocationData {
  latitude: number;
  longitude: number;
  accuracy?: number;
  altitude?: number;
  heading?: number;
  speed?: number;
  timestamp: number;
}

interface UseGPSTrackingOptions {
  bookingId: string;
  enabled?: boolean;
  updateInterval?: number; // milliseconds
  onLocationUpdate?: (location: LocationData) => void;
  onError?: (error: Error) => void;
  fallbackToEstimated?: boolean;
}

interface UseGPSTrackingReturn {
  location: LocationData | null;
  isTracking: boolean;
  isGPSAvailable: boolean;
  isEstimated: boolean;
  error: Error | null;
  startTracking: () => void;
  stopTracking: () => void;
  updateLocation: (location: LocationData) => Promise<void>;
  estimateLocation: (reason: string) => Promise<void>;
}

/**
 * Hook for real-time GPS tracking with automatic fallback
 * 
 * Features:
 * - Automatic GPS tracking with periodic updates
 * - Fallback to estimated location when GPS unavailable
 * - Manual location updates
 * - Error handling and recovery
 */
export function useGPSTracking({
  bookingId,
  enabled = false,
  updateInterval = 10000, // 10 seconds default
  onLocationUpdate,
  onError,
  fallbackToEstimated = true,
}: UseGPSTrackingOptions): UseGPSTrackingReturn {
  const [location, setLocation] = useState<LocationData | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [isGPSAvailable, setIsGPSAvailable] = useState(false);
  const [isEstimated, setIsEstimated] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastUpdateRef = useRef<number>(0);

  // Check if geolocation is available
  const checkGPSAvailability = useCallback(() => {
    if (!navigator.geolocation) {
      setIsGPSAvailable(false);
      return false;
    }
    setIsGPSAvailable(true);
    return true;
  }, []);

  // Update location to server
  const updateLocationToServer = useCallback(
    async (locationData: LocationData, isEstimated: boolean = false, estimatedReason?: string) => {
      try {
        const response = await fetcher.post<{
          data: { location: any; eta_minutes?: number; distance_km?: number };
        }>(`/api/provider/bookings/${bookingId}/location`, {
          latitude: locationData.latitude,
          longitude: locationData.longitude,
          accuracy: locationData.accuracy,
          altitude: locationData.altitude,
          heading: locationData.heading,
          speed: locationData.speed,
          is_estimated: isEstimated,
          estimated_reason: estimatedReason,
        });

        // Update local state
        setLocation(locationData);
        setIsEstimated(isEstimated);

        // Call callback
        if (onLocationUpdate) {
          onLocationUpdate(locationData);
        }

        return response.data;
      } catch (err) {
        const error = err instanceof FetchError ? err : new Error("Failed to update location");
        setError(error);
        if (onError) {
          onError(error);
        } else {
          console.error("GPS tracking error:", error);
        }
        throw error;
      }
    },
    [bookingId, onLocationUpdate, onError]
  );

  // Get current GPS position
  const getCurrentPosition = useCallback(
    (options?: PositionOptions): Promise<LocationData> => {
      return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error("Geolocation is not supported"));
          return;
        }

        navigator.geolocation.getCurrentPosition(
          (position) => {
            const locationData: LocationData = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy ?? undefined,
              altitude: position.coords.altitude ?? undefined,
              heading: position.coords.heading ?? undefined,
              speed: position.coords.speed ?? undefined,
              timestamp: position.timestamp,
            };
            resolve(locationData);
          },
          (error) => {
            reject(new Error(`GPS error: ${error.message}`));
          },
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 5000,
            ...options,
          }
        );
      });
    },
    []
  );

  // Start GPS tracking
  const startTracking = useCallback(() => {
    if (isTracking) return;

    checkGPSAvailability();

    if (!navigator.geolocation) {
      if (fallbackToEstimated) {
        toast.warning("GPS not available. Using estimated location.");
        setIsEstimated(true);
        setIsTracking(true);
        // Start periodic estimated updates
        intervalRef.current = setInterval(() => {
          estimateLocation("gps_unavailable");
        }, updateInterval);
      } else {
        setError(new Error("Geolocation is not supported by your browser"));
        return;
      }
      return;
    }

    setIsTracking(true);
    setError(null);

    // Get initial position
    getCurrentPosition()
      .then((locationData) => {
        updateLocationToServer(locationData, false);
      })
      .catch((err) => {
        console.warn("Failed to get initial GPS position:", err);
        if (fallbackToEstimated) {
          toast.warning("GPS unavailable. Using estimated location.");
          estimateLocation("gps_error");
        } else {
          setError(err);
        }
      });

    // Watch position for continuous updates
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const locationData: LocationData = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy ?? undefined,
          altitude: position.coords.altitude ?? undefined,
          heading: position.coords.heading ?? undefined,
          speed: position.coords.speed ?? undefined,
          timestamp: position.timestamp,
        };

        // Throttle updates to server (don't update more than once per interval)
        const now = Date.now();
        if (now - lastUpdateRef.current >= updateInterval) {
          updateLocationToServer(locationData, false);
          lastUpdateRef.current = now;
        } else {
          // Update local state immediately for UI responsiveness
          setLocation(locationData);
          setIsEstimated(false);
          if (onLocationUpdate) {
            onLocationUpdate(locationData);
          }
        }
      },
      (error) => {
        console.warn("GPS watch error:", error);
        setIsGPSAvailable(false);
        
        if (fallbackToEstimated) {
          toast.warning("GPS signal lost. Using estimated location.");
          estimateLocation("gps_signal_lost");
        } else {
          setError(new Error(`GPS error: ${error.message}`));
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000,
      }
    );
  }, [
    isTracking,
    fallbackToEstimated,
    checkGPSAvailability,
    getCurrentPosition,
    updateLocationToServer,
    updateInterval,
    onLocationUpdate,
  ]);

  // Stop GPS tracking
  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    setIsTracking(false);
  }, []);

  // Manual location update
  const updateLocation = useCallback(
    async (locationData: LocationData) => {
      await updateLocationToServer(locationData, false);
    },
    [updateLocationToServer]
  );

  // Estimate location (fallback when GPS unavailable)
  const estimateLocation = useCallback(
    async (reason: string = "gps_unavailable") => {
      if (!location) {
        // If we have no previous location, we can't estimate
        setError(new Error("Cannot estimate location: no previous location data"));
        return;
      }

      // Use last known location with estimated flag
      const estimatedLocation: LocationData = {
        ...location,
        timestamp: Date.now(),
      };

      await updateLocationToServer(estimatedLocation, true, reason);
    },
    [location, updateLocationToServer]
  );

  // Auto-start if enabled
  useEffect(() => {
    if (enabled && !isTracking) {
      startTracking();
    } else if (!enabled && isTracking) {
      stopTracking();
    }

    return () => {
      stopTracking();
    };
  }, [enabled, isTracking, startTracking, stopTracking]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTracking();
    };
  }, [stopTracking]);

  return {
    location,
    isTracking,
    isGPSAvailable,
    isEstimated,
    error,
    startTracking,
    stopTracking,
    updateLocation,
    estimateLocation,
  };
}
