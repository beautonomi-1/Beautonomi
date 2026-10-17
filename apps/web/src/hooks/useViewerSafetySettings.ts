"use client";

import { useCallback, useEffect, useState } from "react";
import { fetcher } from "@/lib/http/fetcher";
import type { ExploreNavAgeBand } from "@/lib/explore/explore-visibility";

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
export function useViewerSafetySettings(userId: string | null | undefined): ViewerSafetySettings {
  const [state, setState] = useState<ViewerSafetySettings>({
    ...DEFAULTS,
    loading: Boolean(userId),
  });

  const load = useCallback(async () => {
    if (!userId) {
      setState({ ...DEFAULTS, loading: false });
      return;
    }
    setState((prev) => ({ ...prev, loading: true }));
    try {
      const body = await fetcher.get<{ data: SafetySettingsPayload | null }>("/api/me/safety-settings", {
        cache: "no-store",
        timeoutMs: 15_000,
      });
      const data = body?.data;
      setState({
        hide_social_feed: data?.hide_social_feed === true,
        age_band: normalizeAgeBand(data?.age_band),
        loading: false,
      });
    } catch {
      setState({ ...DEFAULTS, loading: false });
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  return state;
}
