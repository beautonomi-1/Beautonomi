"use client";

import { useEffect, useMemo, useState } from "react";
import { supportedLanguages, mergeLanguagePickerOptions } from "@beautonomi/i18n";
import { fetcher } from "@/lib/http/fetcher";

export type LanguageOption = { code: string; name: string };

export type GroupedLanguageOptions = {
  waveA: LanguageOption[];
  waveB: LanguageOption[];
  loading: boolean;
  error: string | null;
  retry: () => void;
};

/**
 * Shared language picker data: API list merged with every bundled locale.
 * Wave A = local / core; Wave B = international (tourists on .co.za).
 */
export function useLanguageOptions(enabled = true): GroupedLanguageOptions {
  const [apiLanguages, setApiLanguages] = useState<LanguageOption[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetcher
      .get<{ data?: LanguageOption[] }>("/api/public/languages", { staleTimeMs: 10 * 60_000 })
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res?.data) ? res.data : [];
        setApiLanguages(list);
      })
      .catch(() => {
        if (!cancelled) setApiLanguages([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, reloadToken]);

  const grouped = useMemo(() => {
    const merged = mergeLanguagePickerOptions(apiLanguages);
    const waveByCode = new Map(supportedLanguages.map((l) => [l.code.toLowerCase(), l.wave]));
    const waveA = merged.filter((l) => waveByCode.get(l.code.toLowerCase()) !== "B");
    const waveB = merged.filter((l) => waveByCode.get(l.code.toLowerCase()) === "B");
    return { waveA, waveB };
  }, [apiLanguages]);

  return {
    ...grouped,
    loading,
    error,
    retry: () => setReloadToken((n) => n + 1),
  };
}
