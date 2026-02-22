/**
 * React Hook for Appointment Settings
 * 
 * Provides a hook to load and manage appointment settings in client components
 */

import { useState, useEffect } from "react";
import { fetcher } from "@/lib/http/fetcher";
import { DEFAULT_APPOINTMENT_STATUS } from "@/lib/provider-portal/constants";
import type { AppointmentSettings } from "@/lib/provider-portal/appointment-settings";

export function useAppointmentSettings() {
  const [settings, setSettings] = useState<AppointmentSettings>({
    defaultAppointmentStatus: DEFAULT_APPOINTMENT_STATUS,
    autoConfirmAppointments: false,
    requireConfirmationForBookings: true,
    updatedAt: null,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await fetcher.get<{ data: AppointmentSettings }>(
          "/api/provider/settings/appointments"
        );
        setSettings(response.data);
      } catch (err: any) {
        console.warn("Failed to load appointment settings:", err);
        setError(err.message || "Failed to load settings");
        // Keep default settings on error
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, []);

  const updateSettings = async (updates: Partial<AppointmentSettings>) => {
    try {
      setError(null);
      const response = await fetcher.patch<{ data: AppointmentSettings }>(
        "/api/provider/settings/appointments",
        updates
      );
      setSettings(response.data);
      return response.data;
    } catch (err: any) {
      const errorMessage = err.message || "Failed to update settings";
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  };

  return {
    settings,
    isLoading,
    error,
    updateSettings,
    refetch: async () => {
      setIsLoading(true);
      try {
        const response = await fetcher.get<{ data: AppointmentSettings }>(
          "/api/provider/settings/appointments"
        );
        setSettings(response.data);
      } catch (err: any) {
        setError(err.message || "Failed to load settings");
      } finally {
        setIsLoading(false);
      }
    },
  };
}
