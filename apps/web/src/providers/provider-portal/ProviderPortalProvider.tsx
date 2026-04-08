"use client";

import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { providerApi } from "@/lib/provider-portal/api";
import type { Provider, Salon } from "@/lib/provider-portal/types";
import { fetcher, PROVIDER_BOOTSTRAP_TIMEOUT_MS } from "@/lib/http/fetcher";

interface ProviderPortalState {
  provider: Provider | null;
  salons: Salon[];
  selectedLocationId: string | null;
  selectedTeamMemberId: string | null;
  sidebarCollapsed: boolean;
  dateView: "day" | "week" | "3-days";
  setupCompletion: number;
}

interface ProviderPortalContextType extends ProviderPortalState {
  setSelectedLocation: (locationId: string) => Promise<void>;
  setSelectedTeamMember: (memberId: string | null) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setDateView: (view: "day" | "week" | "3-days") => void;
  refreshProvider: () => Promise<void>;
  isLoading: boolean;
  loadError: string | null;
}

const ProviderPortalContext = createContext<ProviderPortalContextType | undefined>(undefined);

// Cache provider data to avoid reloading on every mount
let cachedProviderData: {
  provider: Provider | null;
  salons: Salon[];
  setupCompletion: number;
  timestamp: number;
} | null = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache - longer for stability
const STORAGE_KEY = "provider_portal_cache_v2";

// Load from sessionStorage on module load
if (typeof window !== 'undefined') {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as {
        provider?: { id?: string } | null;
        salons?: Salon[];
        setupCompletion?: number;
        timestamp?: number;
      };
      if (parsed.timestamp && Date.now() - parsed.timestamp < CACHE_DURATION) {
        const p = parsed.provider;
        if (p && typeof p === "object" && p.id) {
          cachedProviderData = parsed as NonNullable<typeof cachedProviderData>;
        } else {
          try {
            sessionStorage.removeItem(STORAGE_KEY);
          } catch {
            // ignore
          }
        }
      }
    }
  } catch {
    // Ignore storage errors
  }
}

// Request deduplication
const pendingRequests = new Map<string, Promise<any>>();

export function ProviderPortalProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<ProviderPortalState>({
    provider: null,
    salons: [],
    selectedLocationId: null,
    selectedTeamMemberId: null,
    sidebarCollapsed: false,
    dateView: "day",
    setupCompletion: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const isLoadingRef = useRef(false);
  const loadProviderRef = useRef<(skipCache?: boolean, silent?: boolean) => Promise<void>>(async () => {});

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
    if (!skipCache && cachedProviderData && Date.now() - cachedProviderData.timestamp < CACHE_DURATION) {
      // Optimistically update UI immediately from cache
      setState((prev) => ({
        ...prev,
        provider: cachedProviderData!.provider,
        salons: cachedProviderData!.salons,
        selectedLocationId: cachedProviderData!.provider?.selected_location_id || cachedProviderData!.salons[0]?.id || null,
        setupCompletion: cachedProviderData!.setupCompletion,
      }));
      setIsLoading(false);
      setLoadError(null);
      
      // Refresh in background if cache is getting stale (> 2 minutes old)
      const cacheAge = Date.now() - cachedProviderData.timestamp;
      if (cacheAge > 2 * 60 * 1000) {
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

        // Resolve setup completion from live setup-status first, then fallback to profile/cached values.
        let setupCompletion =
          typeof provider?.setup_completion === "number" ? provider.setup_completion : 0;

        try {
          const setupStatus = await fetcher.get<{ data: { completionPercentage: number } }>(
            "/api/provider/setup-status",
            { timeoutMs: PROVIDER_BOOTSTRAP_TIMEOUT_MS }
          );
          if (typeof setupStatus?.data?.completionPercentage === "number") {
            setupCompletion = setupStatus.data.completionPercentage;
          } else if (cachedProviderData?.setupCompletion !== undefined) {
            setupCompletion = cachedProviderData.setupCompletion;
          }
        } catch {
          if (cachedProviderData?.setupCompletion !== undefined) {
            setupCompletion = cachedProviderData.setupCompletion;
          }
        }
        setState((prev) => ({
          ...prev,
          setupCompletion,
        }));
        
        // Persist initial cache immediately so live refresh can always overwrite it.
        const cacheData = {
          provider,
          salons,
          setupCompletion,
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

  loadProviderRef.current = loadProvider;

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
    // Load selected location from localStorage on mount
    if (typeof window !== 'undefined') {
      try {
        const savedLocationId = localStorage.getItem('provider_selected_location_id');
        if (savedLocationId) {
          setState((prev) => ({ ...prev, selectedLocationId: savedLocationId }));
        }
      } catch {
        // Ignore storage errors
      }
    }
    
    // Only load if we don't have cached data or it's stale
    // This prevents unnecessary reloads when component remounts due to tab visibility
    if (!cachedProviderData || Date.now() - cachedProviderData.timestamp > CACHE_DURATION) {
      loadProvider();
    } else {
      // Use cached data immediately - don't show loading
      const cached = cachedProviderData;
      if (cached) {
        const savedLocationId = typeof window !== 'undefined' 
          ? localStorage.getItem('provider_selected_location_id')
          : null;
        const locationId = savedLocationId || cached.provider?.selected_location_id || cached.salons[0]?.id || null;
        
        setState((prev) => ({
          ...prev,
          provider: cached.provider,
          salons: cached.salons,
          selectedLocationId: locationId,
          setupCompletion: cached.setupCompletion,
        }));
        setIsLoading(false);
        setLoadError(null);
      }
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

  return (
    <ProviderPortalContext.Provider
      value={{
        ...state,
        setSelectedLocation,
        setSelectedTeamMember,
        setSidebarCollapsed,
        setDateView,
        refreshProvider,
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
