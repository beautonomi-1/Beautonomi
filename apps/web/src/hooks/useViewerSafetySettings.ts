"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { fetcher } from "@/lib/http/fetcher";
import type { ExploreNavAgeBand } from "@/lib/explore/explore-visibility";
import {
  VIEWER_SAFETY_SETTINGS_EVENT,
  clearRememberedViewerSafety,
  readRememberedViewerSafety,
  rememberViewerSafety,
  rememberViewerSafetyFromSnapshot,
  type SafetySettingsSnapshot,
} from "@/lib/safety/safety-settings-client";

type SafetySettingsPayload = {
  hide_social_feed?: boolean;
  age_band?: ExploreNavAgeBand;
};

export interface ViewerSafetySettings {
  hide_social_feed: boolean;
  age_band: ExploreNavAgeBand;
  loading: boolean;
}

const DEFAULTS: ViewerSafetySettings = {
  hide_social_feed: false,
  age_band: "unknown",
  loading: false,
};

function normalizeAgeBand(raw: unknown): ExploreNavAgeBand {
  if (raw === "under_13" || raw === "13_17" || raw === "18_plus" || raw === "unknown") {
    return raw;
  }
  return "unknown";
}

/**
 * Effective safety settings for customer web nav (Explore link visibility).
 * Fail-open while loading so nav does not flicker off before GET completes.
 */
function stateFromMemory(userId: string | null | undefined): ViewerSafetySettings {
  if (!userId) return { ...DEFAULTS, loading: false };
  const remembered = readRememberedViewerSafety(userId);
  if (!remembered) return { ...DEFAULTS, loading: true };
  return {
    hide_social_feed: remembered.hide_social_feed,
    age_band: remembered.age_band,
    loading: false,
  };
}

export function useViewerSafetySettings(userId: string | null | undefined): ViewerSafetySettings {
  const [state, setState] = useState<ViewerSafetySettings>(() => stateFromMemory(userId));
  const requestGen = useRef(0);
  const sawUserId = useRef<string | null>(userId ?? null);

  // Auth restores the user in useLayoutEffect. Apply remembered settings in the same phase
  // so the first painted frame does not fail-open. The initial null user is hydration, not logout.
  useLayoutEffect(() => {
    if (!userId) {
      if (sawUserId.current) {
        clearRememberedViewerSafety();
        sawUserId.current = null;
      }
      setState({ ...DEFAULTS, loading: false });
      return;
    }
    sawUserId.current = userId;
    const remembered = readRememberedViewerSafety(userId);
    if (remembered) {
      setState({
        hide_social_feed: remembered.hide_social_feed,
        age_band: remembered.age_band,
        loading: false,
      });
      return;
    }
    setState((prev) => (prev.loading ? prev : { ...prev, loading: true }));
  }, [userId]);

  const load = useCallback(async () => {
    if (!userId) return;
    const gen = ++requestGen.current;
    try {
      const body = await fetcher.get<{ data: SafetySettingsPayload | null }>("/api/me/safety-settings", {
        cache: "no-store",
        staleTimeMs: 0,
        timeoutMs: 15_000,
      });
      if (gen !== requestGen.current) return;
      const data = body?.data;
      const next = {
        hide_social_feed: data?.hide_social_feed === true,
        age_band: normalizeAgeBand(data?.age_band),
      };
      rememberViewerSafety(userId, next);
      setState({ ...next, loading: false });
    } catch {
      if (gen !== requestGen.current) return;
      if (!readRememberedViewerSafety(userId)) setState({ ...DEFAULTS, loading: false });
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!userId || typeof window === "undefined") return;
    const onUpdate = (event: Event) => {
      const detail = (event as CustomEvent<SafetySettingsSnapshot>).detail;
      if (!detail?.settings) return;
      requestGen.current += 1;
      rememberViewerSafetyFromSnapshot(userId, detail);
      setState({
        hide_social_feed: detail.settings.hide_social_feed === true,
        age_band: normalizeAgeBand(detail.age_band),
        loading: false,
      });
    };
    window.addEventListener(VIEWER_SAFETY_SETTINGS_EVENT, onUpdate);
    return () => window.removeEventListener(VIEWER_SAFETY_SETTINGS_EVENT, onUpdate);
  }, [userId]);

  return state;
}
