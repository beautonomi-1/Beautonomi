"use client";

import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { providerApi } from "@/lib/provider-portal/api";
import type { Provider, Salon } from "@/lib/provider-portal/types";
import { fetcher, PROVIDER_BOOTSTRAP_TIMEOUT_MS } from "@/lib/http/fetcher";
import {
  PROVIDER_SETUP_STATUS_CHANGED,
} from "@/lib/provider-portal/setup-status-utils";

interface ProviderPortalState {
  provider: Provider | null;
  salons: Salon[];
  selectedLocationId: string | null;
  selectedTeamMemberId: string | null;
  sidebarCollapsed: boolean;
  dateView: "day" | "week" | "3-days";
  setupCompletion: number;
  /** False until `/api/provider/setup-status` succeeds (avoids showing a stuck 0%). */
  setupStatusKnown: boolean;
}

interface ProviderPortalContextType extends ProviderPortalState {
  setSelectedLocation: (locationId: string) => Promise<void>;
  setSelectedTeamMember: (memberId: string | null) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setDateView: (view: "day" | "week" | "3-days") => void;
  refreshProvider: () => Promise<void>;
  refreshSetupCompletion: () => Promise<void>;
  isLoading: boolean;
  loadError: string | null;
}

const ProviderPortalContext = createContext<ProviderPortalContextType | undefined>(undefined);

// Cache provider data to avoid reloading on every mount
let cachedProviderData: {
  provider: Provider | null;
  salons: Salon[];
  setupCompletion?: number;
  setupStatusKnown?: boolean;
  timestamp: number;
} | null = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache - longer for stability
const BACKGROUND_REFRESH_AGE = 2 * 60 * 1000;
const STORAGE_KEY = "provider_portal_cache_v2";

function readSavedLocationId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem("provider_selected_location_id");
  } catch {
    return null;
  }
}

function isProviderCacheFresh(timestamp: number): boolean {
  return Date.now() - timestamp < CACHE_DURATION;
}

function providerCacheAge(timestamp: number): number {
  return Date.now() - timestamp;
}

function buildStateFromCache(
  cached: NonNullable<typeof cachedProviderData>,
  savedLocationId: string | null,
): Pick<ProviderPortalState, "provider" | "salons" | "selectedLocationId" | "setupCompletion" | "setupStatusKnown"> {
  return {
    provider: cached.provider,
    salons: cached.salons,
    selectedLocationId:
      savedLocationId || cached.provider?.selected_location_id || cached.salons[0]?.id || null,
    setupCompletion: cached.setupCompletion ?? 0,
    setupStatusKnown: cached.setupStatusKnown === true,
  };
}

/** Mirrors active org for `/api/provider/*` (see `ACTIVE_PROVIDER_ID_COOKIE` in api-helpers). */
const ACTIVE_PROVIDER_ID_COOKIE = "bn_active_provider_id";
const ACTIVE_PROVIDER_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function syncActiveProviderIdCookie(providerId: string | null): void {
  if (typeof document === "undefined") return;
  const secure = typeof window !== "undefined" && window.location.protocol === "https:";
  const base = `Path=/; SameSite=Lax${secure ? "; Secure" : ""}`;
  if (!providerId) {
    document.cookie = `${ACTIVE_PROVIDER_ID_COOKIE}=; ${base}; Max-Age=0`;
    return;
  }
  document.cookie = `${ACTIVE_PROVIDER_ID_COOKIE}=${encodeURIComponent(providerId)}; ${base}; Max-Age=${ACTIVE_PROVIDER_COOKIE_MAX_AGE}`;
}

// Load from sessionStorage on module load
if (typeof window !== 'undefined') {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as {
        provider?: { id?: string } | null;
        salons?: Salon[];
        setupCompletion?: number;
        setupStatusKnown?: boolean;
        timestamp?: number;
      };
      if (parsed.timestamp && Date.now() - parsed.timestamp < CACHE_DURATION) {
        const p = parsed.provider;
        if (p && typeof p === "object" && p.id) {
          cachedProviderData = parsed as NonNullable<typeof cachedProviderData>;
          syncActiveProviderIdCookie(p.id);
        } else {
          try {
            sessionStorage.removeItem(STORAGE_KEY);
          } catch {
            // ignore
          }
          syncActiveProviderIdCookie(null);
        }
      }
    }
  } catch {
    // Ignore storage errors
  }
}

// Request deduplication
const pendingRequests = new Map<string, Promise<void>>();

export function ProviderPortalProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<ProviderPortalState>(() => {
    const savedLocationId = readSavedLocationId();
    if (cachedProviderData && isProviderCacheFresh(cachedProviderData.timestamp)) {
      return {
        ...buildStateFromCache(cachedProviderData, savedLocationId),
        selectedTeamMemberId: null,
        sidebarCollapsed: false,
        dateView: "day",
      };
    }
    return {
      provider: null,
      salons: [],
      selectedLocationId: savedLocationId,
      selectedTeamMemberId: null,
      sidebarCollapsed: false,
      dateView: "day",
      setupCompletion: 0,
      setupStatusKnown: false,
    };
  });
  const [isLoading, setIsLoading] = useState(
    () => !(cachedProviderData && isProviderCacheFresh(cachedProviderData.timestamp)),
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const isLoadingRef = useRef(false);
  const loadProviderRef = useRef<(skipCache?: boolean, silent?: boolean) => Promise<void>>(async () => {});
  const fetchSetupCompletionRef = useRef<() => Promise<void>>(async () => {});

  const fetchSetupCompletion = async () => {
    try {
      const setupStatus = await fetcher.get<{ data: { completionPercentage: number } }>(
        "/api/provider/setup-status",
        { timeoutMs: PROVIDER_BOOTSTRAP_TIMEOUT_MS },
      );
      if (typeof setupStatus?.data?.completionPercentage !== "number") return;

      const setupCompletion = setupStatus.data.completionPercentage;
      setState((prev) => ({
        ...prev,
        setupCompletion,
        setupStatusKnown: true,
      }));

      if (cachedProviderData) {
        cachedProviderData = {
          ...cachedProviderData,
          setupCompletion,
          setupStatusKnown: true,
          timestamp: cachedProviderData.timestamp,
        };
        if (typeof window !== "undefined") {
          try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(cachedProviderData));
          } catch {
            // ignore
          }
        }
      }
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("shouldRefreshSetupStatus");
      }
    } catch {
      // Keep cached value when available; otherwise leave badge hidden (setupStatusKnown false).
      if (cachedProviderData?.setupStatusKnown === true) {
        setState((prev) => ({
          ...prev,
          setupCompletion: cachedProviderData!.setupCompletion ?? prev.setupCompletion,
          setupStatusKnown: true,
        }));
      }
    }
  };

  const loadProvider = async (skipCache = false, silent = false) => {
    // Prevent concurrent loads - use request deduplication
    const requestKey = 'loadProvider';
    if (pendingRequests.has(requestKey)) {
      try {
        await pendingRequests.get(requestKey);
        return;
      } catch {
        // Continue with new request if previous failed
      }
    }
    
    // Check cache first (unless explicitly skipping)
    if (!skipCache && cachedProviderData && isProviderCacheFresh(cachedProviderData.timestamp)) {
      // Optimistically update UI immediately from cache
      setState((prev) => ({
        ...prev,
        ...buildStateFromCache(cachedProviderData!, readSavedLocationId()),
      }));
      const cachedPid = cachedProviderData!.provider?.id ?? null;
      syncActiveProviderIdCookie(cachedPid);
      setIsLoading(false);
      setLoadError(null);
      
      // Refresh in background if cache is getting stale (> 2 minutes old)
      const cacheAge = providerCacheAge(cachedProviderData.timestamp);
      if (cacheAge > BACKGROUND_REFRESH_AGE) {
        // Background refresh without blocking UI
        loadProvider(true, true).catch(() => {
          // Silently fail background refresh
        });
      }
      return;
    }

    // Create request promise for deduplication
    const requestPromise = (async () => {
      try {
        isLoadingRef.current = true;
        if (!silent) setIsLoading(true);
        setLoadError(null);
        
        const provider = await providerApi.getProvider();
        const bootstrapSalons = Array.isArray(provider?.locations) ? provider.locations : [];
        const salons =
          bootstrapSalons.length > 0
            ? bootstrapSalons
            : await providerApi.getSalons().catch(() => []);

        if (!provider?.id) {
          cachedProviderData = null;
          syncActiveProviderIdCookie(null);
          if (typeof window !== "undefined") {
            try {
              sessionStorage.removeItem(STORAGE_KEY);
            } catch {
              // ignore
            }
          }
          setState((prev) => ({
            ...prev,
            provider: null,
            salons,
            selectedLocationId: null,
            setupCompletion: 0,
            setupStatusKnown: false,
          }));
          setLoadError(null);
          router.replace("/provider/get-started");
          return;
        }

        // Load saved location from localStorage, or use provider's selected_location_id, or first salon
        const savedLocationId = typeof window !== 'undefined'
          ? localStorage.getItem('provider_selected_location_id')
          : null;
        const locationId = savedLocationId || provider?.selected_location_id || salons[0]?.id || null;
        
        // Update UI immediately with provider and salons (optimistic update)
        const newState = {
          provider,
          salons,
          selectedLocationId: locationId,
        };
        
        setState((prev) => ({
          ...prev,
          ...newState,
        }));

        // Setup completion is fetched independently so a slow profile bootstrap
        // does not leave the topbar stuck at 0%.
        void fetchSetupCompletionRef.current();

        const cacheData = {
          provider,
          salons,
          setupCompletion: cachedProviderData?.setupCompletion,
          setupStatusKnown: cachedProviderData?.setupStatusKnown,
          timestamp: Date.now(),
        };
        cachedProviderData = cacheData;

        // Persist to sessionStorage
        if (typeof window !== 'undefined') {
          try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(cacheData));
          } catch {
            // Ignore storage errors
          }
        }
        syncActiveProviderIdCookie(provider.id);

        setLoadError(null);
      } catch (error) {
        console.error("Failed to load provider data:", error);
        const errorMessage = error instanceof Error ? error.message : "Failed to load provider data";
        setLoadError(errorMessage);
      } finally {
        isLoadingRef.current = false;
        if (!silent) setIsLoading(false);
        pendingRequests.delete(requestKey);
      }
    })();

    pendingRequests.set(requestKey, requestPromise);
    await requestPromise;
  };

  useEffect(() => {
    loadProviderRef.current = loadProvider;
    fetchSetupCompletionRef.current = fetchSetupCompletion;
  });

  useEffect(() => {
    void fetchSetupCompletionRef.current();

    const refreshIfNeeded = () => {
      if (typeof window === "undefined") return;
      if (sessionStorage.getItem("shouldRefreshSetupStatus") === "true") {
        void fetchSetupCompletionRef.current();
      }
    };

    const onSetupChanged = () => {
      void fetchSetupCompletionRef.current();
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        refreshIfNeeded();
      }
    };

    window.addEventListener(PROVIDER_SETUP_STATUS_CHANGED, onSetupChanged);
    window.addEventListener("focus", refreshIfNeeded);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener(PROVIDER_SETUP_STATUS_CHANGED, onSetupChanged);
      window.removeEventListener("focus", refreshIfNeeded);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // After dev-server restart / ECONNRESET, profile load can fail once; retry when tab is visible or network is back.
  useEffect(() => {
    if (!loadError) return;
    const retry = () => {
      void loadProviderRef.current(true, false);
    };
    const onVisible = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        retry();
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener("online", retry);
    }
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisible);
    }
    return () => {
      window.removeEventListener("online", retry);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loadError]);

  useEffect(() => {
    if (!cachedProviderData || !isProviderCacheFresh(cachedProviderData.timestamp)) {
      void loadProviderRef.current();
      return;
    }

    syncActiveProviderIdCookie(cachedProviderData.provider?.id ?? null);
    if (providerCacheAge(cachedProviderData.timestamp) > BACKGROUND_REFRESH_AGE) {
      void loadProviderRef.current(true, true);
    }
  }, []);

  const setSelectedLocation = async (locationId: string) => {
    // Optimistic update - update UI immediately
    setState((prev) => ({ ...prev, selectedLocationId: locationId }));
    
    // Persist to localStorage immediately
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('provider_selected_location_id', locationId);
      } catch {
        // Ignore storage errors
      }
    }
    
    try {
      await providerApi.selectLocation(locationId);
      // Update provider cache if it exists
      if (cachedProviderData?.provider) {
        cachedProviderData.provider.selected_location_id = locationId;
        if (typeof window !== 'undefined') {
          try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(cachedProviderData));
          } catch {
            // Ignore storage errors
          }
        }
      }
    } catch (error) {
      console.error("Failed to select location:", error);
      // Revert on error - check localStorage first, then fallback
      const savedLocationId = typeof window !== 'undefined'
        ? localStorage.getItem('provider_selected_location_id')
        : null;
      const fallbackLocationId = savedLocationId || cachedProviderData?.provider?.selected_location_id || cachedProviderData?.salons[0]?.id || null;
      setState((prev) => ({ 
        ...prev, 
        selectedLocationId: fallbackLocationId
      }));
    }
  };

  const setSelectedTeamMember = (memberId: string | null) => {
    setState((prev) => ({ ...prev, selectedTeamMemberId: memberId }));
  };

  const setSidebarCollapsed = (collapsed: boolean) => {
    setState((prev) => ({ ...prev, sidebarCollapsed: collapsed }));
  };

  const setDateView = (view: "day" | "week" | "3-days") => {
    setState((prev) => ({ ...prev, dateView: view }));
  };

  const refreshProvider = async () => {
    // Clear cache and storage before refreshing
    cachedProviderData = null;
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        // Ignore storage errors
      }
    }
    await loadProvider(true, false);
  };

  const refreshSetupCompletion = async () => {
    await fetchSetupCompletion();
  };

  return (
    <ProviderPortalContext.Provider
      value={{
        ...state,
        setSelectedLocation,
        setSelectedTeamMember,
        setSidebarCollapsed,
        setDateView,
        refreshProvider,
        refreshSetupCompletion,
        isLoading,
        loadError,
      }}
    >
      {children}
    </ProviderPortalContext.Provider>
  );
}

export function useProviderPortal() {
  const context = useContext(ProviderPortalContext);
  if (context === undefined) {
    throw new Error("useProviderPortal must be used within a ProviderPortalProvider");
  }
  return context;
}

/**
 * Invalidate the provider portal cache (sessionStorage + in-memory).
 * Call after saving operating hours, location data, etc. so the calendar
 * and other components pick up fresh data on next load.
 */
export function invalidateProviderPortalCache() {
  cachedProviderData = null;
  if (typeof window !== "undefined") {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}
