/**
 * Provider context - holds provider profile, selected location, and role info.
 * Wraps the app after authentication.
 * Loads when the Supabase user id is present; clears on sign-out / user change.
 */
import { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "@/lib/api-client";
import { useAuth } from "./AuthProvider";
import { captureError, addBreadcrumb } from "@/lib/sentry";

const LOCATION_STORAGE_KEY = "provider_selected_location_id";
/** Persisted when user chooses org-wide view (no branch filter). */
const LOCATION_ALL_SENTINEL = "__all__";

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
  /** Tenant-aligned ISO 4217 code from GET /api/provider/profile (matches web). */
  currency?: string;
  /** BCP 47 locale for formatting when present. */
  locale?: string;
}

interface ProviderContextType {
  provider: ProviderProfile | null;
  role: string | null;
  selectedLocationId: string | null;
  setSelectedLocationId: (id: string | null) => void;
  loading: boolean;
  /** Set when /api/provider/profile fails; cleared on successful load or refresh. */
  profileLoadError: string | null;
  refresh: () => Promise<void>;
}

const ProviderContext = createContext<ProviderContextType | undefined>(undefined);

const PROFILE_LOAD_TIMEOUT_MS = 15 * 1000;

export function ProviderProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [provider, setProvider] = useState<ProviderProfile | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [selectedLocationId, setSelectedLocationIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoadError, setProfileLoadError] = useState<string | null>(null);
  const restoredRef = useRef(false);

  const setSelectedLocationId = useCallback((id: string | null) => {
    setSelectedLocationIdState(id);
    if (id) {
      AsyncStorage.setItem(LOCATION_STORAGE_KEY, id).catch(() => {});
    } else {
      AsyncStorage.setItem(LOCATION_STORAGE_KEY, LOCATION_ALL_SENTINEL).catch(() => {});
    }
  }, []);

  const applyRoleFromResponse = useCallback((roleRes: Awaited<ReturnType<typeof api.get<{ role: string }>>>) => {
    if (roleRes.error) {
      captureError(new Error(roleRes.error.message), {
        area: "ProviderContext.role",
        code: roleRes.error.code,
        status: (roleRes.error as { status?: number }).status,
      });
      setRole(null);
    } else if (roleRes.data?.role) {
      setRole(roleRes.data.role);
    } else {
      setRole(null);
    }
  }, []);

  const fetchProfile = useCallback(async () => {
    const timeoutId = setTimeout(() => setLoading(false), PROFILE_LOAD_TIMEOUT_MS);
    try {
      const [profileRes, roleRes, storedId] = await Promise.all([
        api.get<ProviderProfile>("/api/provider/profile"),
        api.get<{ role: string }>("/api/me/role"),
        restoredRef.current ? Promise.resolve<string | null>(null) : AsyncStorage.getItem(LOCATION_STORAGE_KEY),
      ]);
      restoredRef.current = true;

      const pe = profileRes.error as { status?: number; code?: string; message?: string } | undefined;
      const isNoProviderRowYet =
        pe?.status === 404 || pe?.code === "NOT_FOUND";

      if (profileRes.error && isNoProviderRowYet) {
        // New provider completing onboarding: no providers row yet — expected; still need role for RoleGate.
        setProvider(null);
        setProfileLoadError(null);
        applyRoleFromResponse(roleRes);
      } else if (profileRes.error) {
        captureError(new Error(profileRes.error.message), {
          area: "ProviderContext.profile",
          code: profileRes.error.code,
          status: pe?.status,
        });
        setProfileLoadError(profileRes.error.message);
        setProvider(null);
        applyRoleFromResponse(roleRes);
      } else if (profileRes.data) {
        setProfileLoadError(null);
        setProvider(profileRes.data);
        const locations = profileRes.data.locations ?? [];
        const validIds = locations.map((l) => l.id);

        setSelectedLocationIdState((prev) => {
          if (storedId === LOCATION_ALL_SENTINEL) return null;
          if (storedId && validIds.includes(storedId)) return storedId;
          if (prev && validIds.includes(prev)) return prev;
          return null;
        });
        addBreadcrumb("Provider profile loaded", "provider", {
          providerId: profileRes.data.id,
        });

        applyRoleFromResponse(roleRes);
      } else {
        setProvider(null);
        applyRoleFromResponse(roleRes);
      }
    } catch (e) {
      captureError(e, { area: "ProviderContext.fetchProfile" });
      setProfileLoadError(e instanceof Error ? e.message : "Something went wrong");
      setProvider(null);
      setRole(null);
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }, [applyRoleFromResponse]);

  useEffect(() => {
    if (!userId) {
      setProvider(null);
      setRole(null);
      setSelectedLocationIdState(null);
      setProfileLoadError(null);
      setLoading(false);
      restoredRef.current = false;
      AsyncStorage.removeItem(LOCATION_STORAGE_KEY).catch(() => {});
      return;
    }

    setProvider(null);
    setRole(null);
    setSelectedLocationIdState(null);
    setProfileLoadError(null);
    setLoading(true);
    restoredRef.current = false;
    void fetchProfile();
  }, [userId, fetchProfile]);

  const contextValue = useMemo<ProviderContextType>(
    () => ({
      provider,
      role,
      selectedLocationId,
      setSelectedLocationId,
      loading,
      profileLoadError,
      refresh: fetchProfile,
    }),
    [provider, role, selectedLocationId, setSelectedLocationId, loading, profileLoadError, fetchProfile],
  );

  return (
    <ProviderContext.Provider value={contextValue}>
      {children}
    </ProviderContext.Provider>
  );
}

export function useProvider() {
  const ctx = useContext(ProviderContext);
  if (!ctx) throw new Error("useProvider must be used within ProviderProvider");
  return ctx;
}
