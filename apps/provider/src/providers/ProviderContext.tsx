/**
 * Provider context - holds provider profile, selected location, and role info.
 * Wraps the app after authentication.
 */
import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "@/lib/api-client";
import { identifyProvider } from "@/lib/analytics";
import { useAuth } from "./AuthProvider";

const LOCATION_STORAGE_KEY = "provider_selected_location_id";

interface Location {
  id: string;
  name: string;
  address_line1: string;
  city: string;
  /** 'salon' = clients can visit; 'base' = distance/travel only (mobile-only) */
  location_type?: "salon" | "base";
}

interface ProviderProfile {
  id: string;
  business_name: string;
  business_type: "freelancer" | "salon";
  email: string;
  phone: string;
  avatar_url: string | null;
  locations: Location[];
}

interface ProviderContextType {
  provider: ProviderProfile | null;
  role: string | null;
  selectedLocationId: string | null;
  setSelectedLocationId: (id: string | null) => void;
  loading: boolean;
  refresh: () => Promise<void>;
}

const ProviderContext = createContext<ProviderContextType | undefined>(undefined);

export function ProviderProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [provider, setProvider] = useState<ProviderProfile | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [selectedLocationId, setSelectedLocationIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const restoredRef = useRef(false);

  const setSelectedLocationId = useCallback((id: string | null) => {
    setSelectedLocationIdState(id);
    if (id) {
      AsyncStorage.setItem(LOCATION_STORAGE_KEY, id).catch(() => {});
    } else {
      AsyncStorage.removeItem(LOCATION_STORAGE_KEY).catch(() => {});
    }
  }, []);

  const PROFILE_LOAD_TIMEOUT_MS = 15 * 1000; // avoid infinite loading if API/getAccessToken hangs

  const fetchProfile = useCallback(async () => {
    const timeoutId = setTimeout(() => setLoading(false), PROFILE_LOAD_TIMEOUT_MS);
    try {
      const [profileRes, roleRes, storedId] = await Promise.all([
        api.get<ProviderProfile>("/api/provider/profile"),
        api.get<{ role: string }>("/api/me/role"),
        restoredRef.current ? Promise.resolve(null) : AsyncStorage.getItem(LOCATION_STORAGE_KEY),
      ]);
      restoredRef.current = true;

      if (profileRes.data) {
        setProvider(profileRes.data);
        const locations = profileRes.data.locations ?? [];
        const validIds = locations.map((l) => l.id);

        if (storedId && validIds.includes(storedId)) {
          setSelectedLocationIdState(storedId);
        } else if (!selectedLocationId || !validIds.includes(selectedLocationId)) {
          // Prefer first salon location for at_salon bookings (e.g. new booking screen)
          const salonFirst = locations.find((l) => (l as Location).location_type !== "base");
          const fallback = (salonFirst ?? locations[0])?.id ?? null;
          setSelectedLocationIdState(fallback);
          if (fallback) AsyncStorage.setItem(LOCATION_STORAGE_KEY, fallback).catch(() => {});
        }
      }
      if (roleRes.data) {
        setRole(roleRes.data.role);
      }
    } catch {
      // Profile endpoint may not exist yet
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }, [selectedLocationId, PROFILE_LOAD_TIMEOUT_MS]);

  useEffect(() => {
    fetchProfile();
    // Run once on mount; fetchProfile identity would cause repeated runs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Enrich analytics identify when provider profile is available
  useEffect(() => {
    if (user?.id && provider) {
      identifyProvider(user.id, {
        provider_id: provider.id,
        role: role ?? undefined,
        business_type: provider.business_type,
        locations_count: provider.locations?.length ?? 0,
      });
    }
  }, [user?.id, provider, role]);

  return (
    <ProviderContext.Provider
      value={{
        provider,
        role,
        selectedLocationId,
        setSelectedLocationId,
        loading,
        refresh: fetchProfile,
      }}
    >
      {children}
    </ProviderContext.Provider>
  );
}

export function useProvider() {
  const ctx = useContext(ProviderContext);
  if (!ctx) throw new Error("useProvider must be used within ProviderProvider");
  return ctx;
}
