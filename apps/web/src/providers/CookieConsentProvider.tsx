"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useAuth } from "@/providers/AuthProvider";
import {
  buildAcceptAll,
  buildCustom,
  buildRejectNonEssential,
  getConsentServerSnapshot,
  getConsentSnapshot,
  needsReprompt,
  subscribeStoredConsent,
} from "@/lib/cookie-consent/storage";
import type { StoredCookieConsent } from "@/lib/cookie-consent/types";
import {
  resolveAllowsAnalytics,
  resolveAllowsFunctional,
  resolveAllowsMarketing,
} from "@/lib/cookie-consent/resolve-allows";

interface CookieConsentContextValue {
  /** Storage has been read on the client; safe to gate scripts. */
  isReady: boolean;
  consent: StoredCookieConsent | null;
  showBanner: boolean;
  preferencesOpen: boolean;
  openPreferences: (triggerEl?: HTMLElement | null) => void;
  closePreferences: () => void;
  acceptAll: () => void;
  rejectNonEssential: () => void;
  saveCustom: (categories: { analytics: boolean; functional: boolean; marketing: boolean }) => void;
  allowsAnalytics: boolean;
  allowsFunctional: boolean;
  allowsMarketing: boolean;
  /** Server-side account preference for analytics (logged-in only); null while unknown. */
  serverAnalyticsAllowed: boolean | null;
  /** Internal: consume once for focus restoration after modal close (Radix `onCloseAutoFocus`). */
  takeReturnFocusTarget: () => HTMLElement | null;
}

const CookieConsentContext = createContext<CookieConsentContextValue | null>(null);

function subscribeClientReady(): () => void {
  return () => {};
}

function getClientReadySnapshot(): boolean {
  return true;
}

function getServerReadySnapshot(): boolean {
  return false;
}

export function CookieConsentProvider({ children }: { children: ReactNode }) {
  const { user, session, isLoading: authLoading } = useAuth();
  const userId = user?.id ?? null;
  const isReady = useSyncExternalStore(
    subscribeClientReady,
    getClientReadySnapshot,
    getServerReadySnapshot,
  );
  const consent = useSyncExternalStore(
    subscribeStoredConsent,
    getConsentSnapshot,
    getConsentServerSnapshot,
  );
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [accountAnalytics, setAccountAnalytics] = useState<{
    userId: string;
    allowed: boolean;
  } | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (authLoading || !userId || !session) return;
    let cancelled = false;
    const requestedUserId = userId;

    void fetch("/api/me/analytics/consent", { credentials: "same-origin" })
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setAccountAnalytics({ userId: requestedUserId, allowed: false });
          return;
        }
        const json = (await res.json()) as { data?: { analytics_consent?: boolean } };
        if (cancelled) return;
        setAccountAnalytics({
          userId: requestedUserId,
          allowed: json.data?.analytics_consent !== false,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setAccountAnalytics({ userId: requestedUserId, allowed: false });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, session, userId]);

  const serverAnalyticsAllowed =
    !authLoading && (!userId || !session)
      ? null
      : accountAnalytics?.userId === userId
        ? accountAnalytics.allowed
        : null;

  const showBanner = useMemo(() => {
    if (!isReady) return false;
    return needsReprompt(consent);
  }, [isReady, consent]);

  const allowsAnalytics = useMemo(
    () =>
      resolveAllowsAnalytics({
        consentReady: isReady,
        consent,
        hasUser: Boolean(user),
        serverAnalyticsAllowed,
      }),
    [isReady, consent, user, serverAnalyticsAllowed],
  );

  const allowsFunctional = useMemo(
    () => resolveAllowsFunctional(isReady, consent),
    [isReady, consent],
  );

  const allowsMarketing = useMemo(
    () => resolveAllowsMarketing(isReady, consent),
    [isReady, consent],
  );

  const syncAccountAnalyticsIfPossible = useCallback(async (analytics: boolean) => {
    if (!user || !session) return;
    try {
      await fetch("/api/me/privacy-settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analytics_consent: analytics }),
      });
    } catch {
      /* non-blocking */
    }
  }, [session, user]);

  const acceptAll = useCallback(() => {
    buildAcceptAll();
    setPreferencesOpen(false);
    void syncAccountAnalyticsIfPossible(true);
  }, [syncAccountAnalyticsIfPossible]);

  const rejectNonEssential = useCallback(() => {
    buildRejectNonEssential();
    setPreferencesOpen(false);
    void syncAccountAnalyticsIfPossible(false);
  }, [syncAccountAnalyticsIfPossible]);

  const saveCustom = useCallback(
    (categories: { analytics: boolean; functional: boolean; marketing: boolean }) => {
      buildCustom(categories);
      setPreferencesOpen(false);
      void syncAccountAnalyticsIfPossible(categories.analytics);
    },
    [syncAccountAnalyticsIfPossible],
  );

  const openPreferences = useCallback((triggerEl?: HTMLElement | null) => {
    returnFocusRef.current = triggerEl ?? null;
    setPreferencesOpen(true);
  }, []);

  const closePreferences = useCallback(() => setPreferencesOpen(false), []);

  const takeReturnFocusTarget = useCallback((): HTMLElement | null => {
    const el = returnFocusRef.current;
    returnFocusRef.current = null;
    return el;
  }, []);

  const value = useMemo<CookieConsentContextValue>(
    () => ({
      isReady,
      consent,
      showBanner,
      preferencesOpen,
      openPreferences,
      closePreferences,
      acceptAll,
      rejectNonEssential,
      saveCustom,
      allowsAnalytics,
      allowsFunctional,
      allowsMarketing,
      serverAnalyticsAllowed,
      takeReturnFocusTarget,
    }),
    [
      isReady,
      consent,
      showBanner,
      preferencesOpen,
      openPreferences,
      closePreferences,
      acceptAll,
      rejectNonEssential,
      saveCustom,
      allowsAnalytics,
      allowsFunctional,
      allowsMarketing,
      serverAnalyticsAllowed,
      takeReturnFocusTarget,
    ],
  );

  return <CookieConsentContext.Provider value={value}>{children}</CookieConsentContext.Provider>;
}

export function useCookieConsent(): CookieConsentContextValue {
  const ctx = useContext(CookieConsentContext);
  if (!ctx) {
    throw new Error("useCookieConsent must be used within CookieConsentProvider");
  }
  return ctx;
}
