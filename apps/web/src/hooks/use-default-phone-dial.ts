"use client";

import { useEffect, useState } from "react";
import {
  getCachedDefaultPhoneDial,
  inferIsoFromNavigatorLocale,
  inferIsoFromTimeZone,
  resolveDialFromIso,
  setCachedDefaultPhoneDial,
} from "@/lib/user-default-phone-dial";

const FALLBACK_DIAL = "+27";

/**
 * Resolved E.164 calling prefix (e.g. +27). When `overrideDial` is set, skips geo/locale inference.
 */
export function useDefaultPhoneDialCode(overrideDial?: string): string {
  const [resolved, setResolved] = useState<string>(() => {
    if (overrideDial?.startsWith("+")) return overrideDial;
    return getCachedDefaultPhoneDial() ?? FALLBACK_DIAL;
  });

  useEffect(() => {
    if (overrideDial?.startsWith("+")) {
      setResolved(overrideDial);
      return;
    }

    const cached = getCachedDefaultPhoneDial();
    if (cached) {
      setResolved(cached);
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/public/geo-country", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const body = await res.json();
        const iso = body?.data?.countryCode as string | null | undefined;
        const dial = resolveDialFromIso(iso || undefined);
        if (!cancelled && dial) {
          setResolved(dial);
          setCachedDefaultPhoneDial(dial);
          return;
        }
      } catch {
        /* fall through */
      }

      if (cancelled) return;
      const iso = inferIsoFromNavigatorLocale() || inferIsoFromTimeZone();
      const dial = resolveDialFromIso(iso) ?? FALLBACK_DIAL;
      setResolved(dial);
      setCachedDefaultPhoneDial(dial);
    })();

    return () => {
      cancelled = true;
    };
  }, [overrideDial]);

  return overrideDial?.startsWith("+") ? overrideDial : resolved;
}
