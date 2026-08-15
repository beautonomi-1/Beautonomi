/**
 * Provider context - holds provider profile, selected location, and role info.
 * Wraps the app after authentication.
 * Loads when the Supabase user id is present; clears on sign-out / user change.
 */
import { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo, type ReactNode } from "react";
import { DeviceEventEmitter } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "@/lib/api-client";
import {
  ACTIVE_PROVIDER_ORG_HINT_STORAGE_KEY,
  looksLikeActiveProviderUuid,
  setActiveProviderApiHint,
} from "@/lib/active-provider-api-hint";
import { useAuth } from "./AuthProvider";
import { getApiErrorCode, getApiErrorMessage, getHttpErrorStatus, isTransientApiFailure } from "@/lib/api-error";
import { captureApiFailure, addBreadcrumb } from "@/lib/sentry";
import { emitProviderRoleChanged } from "@/lib/provider-role-events";
import { isProviderApiRole, setProviderApiReady } from "@/lib/provider-api-readiness";

const LOCATION_STORAGE_KEY = "provider_selected_location_id";

function locationStorageKey(providerId?: string | null): string {
  return providerId ? `${LOCATION_STORAGE_KEY}:${providerId}` : LOCATION_STORAGE_KEY;
}
/** Persisted when user chooses org-wide view (no branch filter). */
const LOCATION_ALL_SENTINEL = "__all__";

interface Location {
  id: string;
  name: string;
  address_line1: string;
  city: string;
  /** When true, prefer this branch as the default filter (matches web “primary location”). */
  is_primary?: boolean;
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
  is_verified?: boolean;
  verification_status?: string;
  /**
   * §provider-launch (2026-06): provider account approval status
   * (`draft` | `pending_approval` | `active` | `suspended`). Surfaced from
   * `providers.status` so the dashboard can show an "under review" banner for
   * `pending_approval` providers who now reach the dashboard directly.
   */
  status?: "draft" | "pending_approval" | "active" | "suspended" | string | null;
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
const ONBOARDING_ENTRY_ROLES = new Set(["customer", "provider_onboarding"]);

/** Background abort or congested resume — keep cached profile/role in the UI. */
function isRecoverableFetchError(err: unknown): boolean {
  const code = getApiErrorCode(err);
  return code === "CANCELLED" || code === "TIMEOUT" || code === "NETWORK_ERROR";
}

function reportFetchFailure(err: unknown, area: string, uiHandled: boolean) {
  captureApiFailure(
    err instanceof Error ? err : new Error(getApiErrorMessage(err)),
    {
      area,
      code: getApiErrorCode(err),
      status: getHttpErrorStatus(err),
    },
    { uiHandled },
  );
}

function roleFromResponse(roleRes: Awaited<ReturnType<typeof api.get<{ role: string }>>>): string | null {
  if (roleRes.error) {
    if (isRecoverableFetchError(roleRes.error)) return null;
    return null;
  }
  return roleRes.data?.role ?? null;
}

function isAuthStatus(status: number | undefined): boolean {
  return status === 401 || status === 403;
}

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
  /** Latest selected branch so fetchProfile can resolve location without a stale closure. */
  const selectedLocationIdRef = useRef<string | null>(null);
  const providerRef = useRef<ProviderProfile | null>(null);

  const setSelectedLocationId = useCallback((id: string | null) => {
    setSelectedLocationIdState(id);
    const key = locationStorageKey(providerRef.current?.id);
    if (id) {
      AsyncStorage.setItem(key, id).catch(() => {});
    } else {
      AsyncStorage.setItem(key, LOCATION_ALL_SENTINEL).catch(() => {});
    }
  }, []);

  useEffect(() => {
    selectedLocationIdRef.current = selectedLocationId;
  }, [selectedLocationId]);

  const applyRoleFromResponse = useCallback((roleRes: Awaited<ReturnType<typeof api.get<{ role: string }>>>) => {
    if (roleRes.error) {
      // Background abort — keep the last good role; index.tsx ignores CANCELLED the same way.
      if (isRecoverableFetchError(roleRes.error)) {
        return;
      }
      captureApiFailure(new Error(roleRes.error.message), {
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

  const lastProfileFetchRef = useRef(0);
  const roleRef = useRef<string | null>(null);
  const profileLoadErrorRef = useRef<string | null>(null);
  /**
   * The role for which `/api/provider/profile` actually answered 403. Only a
   * role-gate rejection is safe to stop re-requesting, because it cannot change
   * until the role does. A 404 (role accepted, provider row not created yet) must
   * still be retried — the row can appear with no role change to invalidate on —
   * and a transient failure must never strand a provider who does have a profile.
   */
  const profileForbiddenForRoleRef = useRef<string | null>(null);

  useEffect(() => {
    providerRef.current = provider;
  }, [provider]);

  useEffect(() => {
    roleRef.current = role;
    // Broadcast to root-level consumers (e.g. PushNotificationsProvider) that
    // live above this provider in the tree and therefore can't use useProvider().
    emitProviderRoleChanged(role);
  }, [role]);

  // A loaded provider profile also proves authorization, which covers the
  // `provider_onboarding` role that the server accepts for provider routes.
  useEffect(() => {
    setProviderApiReady(isProviderApiRole(role) || provider !== null);
  }, [role, provider]);

  useEffect(() => {
    profileLoadErrorRef.current = profileLoadError;
  }, [profileLoadError]);

  const fetchProfile = useCallback(async (options?: { showLoading?: boolean; background?: boolean }) => {
    const myId = ++fetchIdRef.current;
    const background = options?.background === true;
    if (options?.showLoading) {
      setLoading(true);
    }
    const timeoutId = setTimeout(() => {
      if (fetchIdRef.current === myId) {
        setLoading(false);
        // Only surface a blocking error when there is no cached profile/role to show.
        if (!providerRef.current && !roleRef.current) {
          setProfileLoadError(
            (prev) =>
              prev ??
              "Profile is taking longer than expected. Pull to refresh or check your connection.",
          );
        }
      }
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

      // `/api/provider/profile` already answered 403 for this exact role, which
      // is the normal state for the whole onboarding wizard. Re-asking on every
      // foreground resume only buys another 403, so re-check role first and ask
      // for the profile again only once the role has moved on.
      const profileForbiddenForCurrentRole =
        providerRef.current === null &&
        roleRef.current !== null &&
        profileForbiddenForRoleRef.current === roleRef.current;

      const [profileResInitial, roleResFirst, storedId] = await Promise.all([
        profileForbiddenForCurrentRole
          ? Promise.resolve(null)
          : api.get<ProviderProfile>("/api/provider/profile"),
        api.get<{ role: string }>("/api/me/role"),
        AsyncStorage.getItem(LOCATION_STORAGE_KEY),
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

      const roleSkipped = !!roleRes.error && isRecoverableFetchError(roleRes.error);

      let profileRes = profileResInitial;
      if (profileRes === null) {
        const nextRole = roleSkipped ? roleRef.current : roleFromResponse(roleRes);
        if (nextRole !== profileForbiddenForRoleRef.current) {
          // Role moved on, so the profile may load now.
          profileForbiddenForRoleRef.current = null;
          profileRes = await api.get<ProviderProfile>("/api/provider/profile");
          if (fetchIdRef.current !== myId) return;
        }
      }
      if (profileRes === null) {
        // Still the same role the profile was rejected for — nothing to load.
        setProvider(null);
        setProfileLoadError(null);
        setActiveProviderApiHint(null);
        AsyncStorage.removeItem(ACTIVE_PROVIDER_ORG_HINT_STORAGE_KEY).catch(() => {});
        if (!roleSkipped) applyRoleFromResponse(roleRes);
        return;
      }

      const profileSkipped = !!profileRes.error && isRecoverableFetchError(profileRes.error);
      const hasCachedBootstrap = !!(providerRef.current || roleRef.current);

      if (profileSkipped && profileRes.error) {
        reportFetchFailure(profileRes.error, "ProviderContext.profile", hasCachedBootstrap);
      }
      if (roleSkipped && roleRes.error) {
        reportFetchFailure(roleRes.error, "ProviderContext.role", hasCachedBootstrap);
      }

      // Background abort or resume congestion — leave profile + role untouched.
      if (profileSkipped && roleSkipped) {
        if (hasCachedBootstrap) {
          setProfileLoadError(null);
        }
        return;
      }

      const pe = profileRes.error as { status?: number; code?: string; message?: string } | undefined;
      const isNoProviderRowYet =
        pe?.status === 404 || pe?.code === "NOT_FOUND" || pe?.code === "NEW_PROVIDER";
      const resolvedRole = roleFromResponse(roleRes);
      const roleForLogic = roleSkipped ? roleRef.current : resolvedRole;
      const isExpectedOnboardingProfileAuthError =
        !profileSkipped &&
        !!profileRes.error &&
        isAuthStatus(pe?.status) &&
        !!roleForLogic &&
        ONBOARDING_ENTRY_ROLES.has(roleForLogic);

      if (!profileSkipped && profileRes.error && isNoProviderRowYet) {
        // New provider completing onboarding: no providers row yet — expected; still need role for RoleGate.
        setProvider(null);
        setProfileLoadError(null);
        setActiveProviderApiHint(null);
        AsyncStorage.removeItem(ACTIVE_PROVIDER_ORG_HINT_STORAGE_KEY).catch(() => {});
        if (!roleSkipped) applyRoleFromResponse(roleRes);
      } else if (!profileSkipped && isExpectedOnboardingProfileAuthError) {
        // First-run users may still be customer/provider_onboarding while the
        // setup wizard creates the provider row. Keep them in onboarding instead
        // of surfacing the provider-profile 403 as a scary banner.
        profileForbiddenForRoleRef.current = roleForLogic;
        setProvider(null);
        setProfileLoadError(null);
        setActiveProviderApiHint(null);
        AsyncStorage.removeItem(ACTIVE_PROVIDER_ORG_HINT_STORAGE_KEY).catch(() => {});
        if (!roleSkipped) applyRoleFromResponse(roleRes);
      } else if (!profileSkipped && profileRes.error) {
        if (background && hasCachedBootstrap) {
          if (!roleSkipped) applyRoleFromResponse(roleRes);
          return;
        }
        if (isRecoverableFetchError(profileRes.error)) {
          if (hasCachedBootstrap) {
            setProfileLoadError(null);
          }
          if (!roleSkipped) applyRoleFromResponse(roleRes);
          return;
        }
        captureApiFailure(new Error(profileRes.error.message), {
          area: "ProviderContext.profile",
          code: profileRes.error.code,
          status: pe?.status,
        });
        setProfileLoadError(profileRes.error.message);
        setProvider(null);
        if (!roleSkipped) applyRoleFromResponse(roleRes);
      } else if (profileRes.data) {
        profileForbiddenForRoleRef.current = null;
        setProfileLoadError(null);
        setProvider(profileRes.data);
        providerRef.current = profileRes.data;
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
        const validSet = new Set(validIds);
        const prev = selectedLocationIdRef.current;
        const orgStored = await AsyncStorage.getItem(locationStorageKey(profileRes.data.id));
        const preferredStored = orgStored ?? storedId;

        let nextLocationId: string | null = null;
        if (preferredStored === LOCATION_ALL_SENTINEL) {
          nextLocationId = null;
        } else if (preferredStored && validSet.has(preferredStored)) {
          nextLocationId = preferredStored;
        } else if (prev && validSet.has(prev)) {
          nextLocationId = prev;
        } else if (validIds.length > 0) {
          const primaryLoc = locations.find((l) => l.is_primary === true);
          nextLocationId = primaryLoc?.id ?? validIds[0] ?? null;
        } else {
          nextLocationId = null;
        }

        setSelectedLocationId(nextLocationId);
        addBreadcrumb("Provider profile loaded", "provider", {
          providerId: profileRes.data.id,
        });

        if (!roleSkipped) applyRoleFromResponse(roleRes);
      } else if (!profileSkipped) {
        setProvider(null);
        if (!roleSkipped) applyRoleFromResponse(roleRes);
      } else if (!roleSkipped) {
        applyRoleFromResponse(roleRes);
      }
    } catch (e) {
      if (fetchIdRef.current !== myId) return;
      const recoverable = isRecoverableFetchError(e) || isTransientApiFailure(e);
      const hasCachedBootstrap = !!(providerRef.current || roleRef.current);
      reportFetchFailure(e, "ProviderContext.fetchProfile", recoverable && hasCachedBootstrap);
      if ((recoverable || background) && hasCachedBootstrap) return;
      if (recoverable) {
        setProfileLoadError(getApiErrorMessage(e));
        return;
      }
      setProfileLoadError(e instanceof Error ? e.message : "Something went wrong");
      setProvider(null);
      setRole(null);
      setActiveProviderApiHint(null);
    } finally {
      clearTimeout(timeoutId);
      if (fetchIdRef.current === myId) {
        setLoading(false);
        lastProfileFetchRef.current = Date.now();
      }
    }
  }, [applyRoleFromResponse, userId, setSelectedLocationId]);

  useEffect(() => {
    profileForbiddenForRoleRef.current = null;
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

  // Refresh on foreground: silent stale-while-revalidate when we already have
  // profile/role; only show the gate loader when bootstrap data is missing.
  useEffect(() => {
    if (!userId) return;
    const onFocusOrRecover = () => {
      if (loading) return;
      const needsRecovery = roleRef.current === null || profileLoadErrorRef.current != null;
      const hasBootstrap = !!(providerRef.current || roleRef.current);
      void fetchProfile({
        background: true,
        showLoading: needsRecovery && !hasBootstrap,
      });
    };
    const subFocus = DeviceEventEmitter.addListener("beautonomi:app:focus", onFocusOrRecover);
    const subRecover = DeviceEventEmitter.addListener("beautonomi:network:recover", onFocusOrRecover);
    return () => {
      subFocus.remove();
      subRecover.remove();
    };
  }, [userId, loading, fetchProfile]);

  const contextValue = useMemo<ProviderContextType>(
    () => ({
      provider,
      role,
      selectedLocationId,
      setSelectedLocationId,
      loading,
      profileLoadError,
      refresh: () => fetchProfile({ showLoading: true }),
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
