"use client";

import { useState, useEffect, useCallback } from "react";
import { fetcher } from "@/lib/http/fetcher";
import { useAuth } from "@/providers/AuthProvider";

export interface SavedAddress {
  id: string;
  label: string;
  address_line1: string;
  address_line2?: string | null;
  city: string;
  state?: string | null;
  postal_code?: string | null;
  country: string;
  latitude?: number | null;
  longitude?: number | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
  // House call specific fields
  apartment_unit?: string | null;
  building_name?: string | null;
  floor_number?: string | null;
  access_codes?: { gate?: string; buzzer?: string; door?: string } | string | null;
  parking_instructions?: string | null;
  location_landmarks?: string | null;
}

export function useSavedAddresses() {
  const { user, isLoading: authLoading } = useAuth();
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAddresses = useCallback(async (attempt = 0) => {
    if (!user) {
      setAddresses([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await fetcher.get<{ data: SavedAddress[] }>("/api/me/addresses", {
        cache: "no-store",
        timeoutMs: 15_000,
      });
      setAddresses(response.data || []);
    } catch (err: any) {
      if (err.status === 401 || err.status === 403) {
        setAddresses([]);
        setError(null);
      } else {
        if (attempt < 1) {
          await new Promise((r) => setTimeout(r, 450));
          await loadAddresses(attempt + 1);
          return;
        }
        const message = err.message || "Failed to load addresses";
        setError(message);
        console.error("Error loading addresses:", err);
      }
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    if (user) {
      void loadAddresses();
    } else {
      setAddresses([]);
      setIsLoading(false);
      setError(null);
    }
  }, [user, authLoading, loadAddresses]);

  const saveAddress = async (addressData: Omit<SavedAddress, "id" | "created_at" | "updated_at">) => {
    try {
      const response = await fetcher.post<{ data: SavedAddress }>("/api/me/addresses", addressData);
      await loadAddresses();
      return response.data;
    } catch (err: any) {
      throw new Error(err.message || "Failed to save address");
    }
  };

  const updateAddress = async (id: string, addressData: Partial<SavedAddress>) => {
    try {
      const response = await fetcher.put<{ data: SavedAddress }>(`/api/me/addresses/${id}`, addressData);
      await loadAddresses();
      return response.data;
    } catch (err: any) {
      throw new Error(err.message || "Failed to update address");
    }
  };

  const deleteAddress = async (id: string) => {
    try {
      await fetcher.delete(`/api/me/addresses/${id}`);
      await loadAddresses();
    } catch (err: any) {
      throw new Error(err.message || "Failed to delete address");
    }
  };

  const getDefaultAddress = () => {
    return addresses.find((addr) => addr.is_default) || addresses[0] || null;
  };

  return {
    addresses,
    isLoading,
    error,
    loadAddresses,
    saveAddress,
    updateAddress,
    deleteAddress,
    getDefaultAddress,
  };
}
