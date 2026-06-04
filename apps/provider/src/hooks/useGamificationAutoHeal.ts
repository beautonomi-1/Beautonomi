import { useEffect, useRef } from "react";
import { useApiMutation } from "@/hooks/useApi";

type GamificationPointsSlice = {
  points?: { total?: number };
  provider_stats?: {
    total_bookings?: number;
    review_count?: number;
  };
};

/**
 * When GET returns 0 points but the provider has booking/review history, run POST
 * /api/provider/gamification once to backfill the ledger (mirrors provider web).
 */
export function useGamificationAutoHeal(
  data: GamificationPointsSlice | null,
  refresh: () => Promise<void>,
  enabled = true,
) {
  const healedRef = useRef(false);
  const { execute: postSync } = useApiMutation("post");

  useEffect(() => {
    if (!enabled || !data || healedRef.current) return;

    const total = data.points?.total ?? 0;
    if (total > 0) return;

    const bookings = data.provider_stats?.total_bookings ?? 0;
    const reviews = data.provider_stats?.review_count ?? 0;
    if (bookings === 0 && reviews === 0) return;

    healedRef.current = true;
    void (async () => {
      const { error } = await postSync("/api/provider/gamification", {});
      if (!error) {
        await refresh();
      } else {
        healedRef.current = false;
      }
    })();
  }, [data, enabled, postSync, refresh]);
}
