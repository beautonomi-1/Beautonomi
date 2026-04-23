/**
 * Provider context - holds provider profile, selected location, and role info.
 * Wraps the app after authentication.
 * Loads when the Supabase user id is present; clears on sign-out / user change.
 */
import { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "@/lib/api-client";
import {
  ACTIVE_PROVIDER_ORG_HINT_STORAGE_KEY,
  looksLikeActiveProviderUuid,
  setActiveProviderApiHint,
} from "@/lib/active-provider-api-hint";
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
  /**
   * §Release-audit 2026-04: IANA timezone (e.g. `Africa/Johannesburg`)
   * surfaced by `/api/provider/profile`. Consumed by calendar drag-to-
   * reschedule to interpret the drop-zone wall clock in provider time
   * rather than the device's local time. Without it, providers operating
   * in a different zone than their phone saw the wrong UTC instant
   * persisted on the booking.
   */
  timezone?: string | null;
  /**
   * §Provider-audit 2026-04: whether this provider offers house-call /
   * mobile service. Surfaced from the `providers.offers_mobile_services`
   * column so native screens can gate UI (e.g. the "At Home" chip in the
   * new-booking creator) and avoid producing bookings that the public
   * flow would reject.
   */
  offers_mobile_services?: boolean;
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
  /** Incremented each time a new fetchProfile run starts; guards against stale concurrent responses. */
  const fetchIdRef = useRef(0);

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
    const myId = ++fetchIdRef.current;
    const timeoutId = setTimeout(() => {
      if (fetchIdRef.current === myId) setLoading(false);
    }, PROFILE_LOAD_TIMEOUT_MS);
    try {
      try {
        const raw = await AsyncStorage.getItem(ACTIVE_PROVIDER_ORG_HINT_STORAGE_KEY);
        if (raw && userId) {
          const o = JSON.parse(raw) as { userId?: string; providerId?: string };
          if (
            typeof o.userId === "string" &&
            o.userId === userId &&
            typeof o.providerId === "string" &&
            looksLikeActiveProviderUuid(o.providerId)
          ) {
            setActiveProviderApiHint(o.providerId);
          } else {
            setActiveProviderApiHint(null);
          }
        } else {
          setActiveProviderApiHint(null);
        }
      } catch {
        setActiveProviderApiHint(null);
      }

      const [profileRes, roleResFirst, storedId] = await Promise.all([
        api.get<ProviderProfile>("/api/provider/profile"),
        api.get<{ role: string }>("/api/me/role"),
        restoredRef.current ? Promise.resolve<string | null>(null) : AsyncStorage.getItem(LOCATION_STORAGE_KEY),
      ]);

      // Discard this response if a newer fetchProfile has already started.
      if (fetchIdRef.current !== myId) return;

      restoredRef.current = true;

      // Retry /api/me/role on 5xx errors (e.g. self-heal race for newly created user rows).
      // Mirrors the customer RoleGate retry behaviour so the provider app also heals transparently.
      let roleRes = roleResFirst;
      const roleStatus = (roleResFirst.error as { status?: number } | undefined)?.status;
      if (roleResFirst.error && roleStatus !== undefined && roleStatus >= 500) {
        for (let attempt = 1; attempt <= 2; attempt++) {
          await new Promise((r) => setTimeout(r, 400 * attempt));
          if (fetchIdRef.current !== myId) return;
          const retried = await api.get<{ role: string }>("/api/me/role");
          roleRes = retried;
          const retriedStatus = (retried.error as { status?: number } | undefined)?.status;
          if (!retried.error || retriedStatus === undefined || retriedStatus < 500) break;
        }
        if (fetchIdRef.current !== myId) return;
      }

      const pe = profileRes.error as { status?: number; code?: string; message?: string } | undefined;
      const isNoProviderRowYet =
        pe?.status === 404 || pe?.code === "NOT_FOUND";

      if (profileRes.error && isNoProviderRowYet) {
        // New provider completing onboarding: no providers row yet — expected; still need role for RoleGate.
        setProvider(null);
        setProfileLoadError(null);
        setActiveProviderApiHint(null);
        AsyncStorage.removeItem(ACTIVE_PROVIDER_ORG_HINT_STORAGE_KEY).catch(() => {});
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
        if (userId) {
          const pid = profileRes.data.id;
          setActiveProviderApiHint(pid);
          AsyncStorage.setItem(
            ACTIVE_PROVIDER_ORG_HINT_STORAGE_KEY,
            JSON.stringify({ userId, providerId: pid }),
          ).catch(() => {});
        }
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
      if (fetchIdRef.current !== myId) return;
      captureError(e, { area: "ProviderContext.fetchProfile" });
      setProfileLoadError(e instanceof Error ? e.message : "Something went wrong");
      setProvider(null);
      setRole(null);
      setActiveProviderApiHint(null);
    } finally {
      clearTimeout(timeoutId);
      if (fetchIdRef.current === myId) setLoading(false);
    }
  }, [applyRoleFromResponse, userId]);

  useEffect(() => {
    if (!userId) {
      setProvider(null);
      setRole(null);
      setSelectedLocationIdState(null);
      setProfileLoadError(null);
      setLoading(false);
      restoredRef.current = false;
      setActiveProviderApiHint(null);
      AsyncStorage.removeItem(LOCATION_STORAGE_KEY).catch(() => {});
      AsyncStorage.removeItem(ACTIVE_PROVIDER_ORG_HINT_STORAGE_KEY).catch(() => {});
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
