"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@beautonomi/i18n";
import { fetcher } from "@/lib/http/fetcher";

interface TeaserData {
  current_badge: { name: string } | null;
  progress_to_next_badge: {
    badge: { name: string };
    points_needed: number;
  } | null;
  points?: { total: number };
}

export function ProviderRewardsTeaser() {
  const { t } = useTranslation();
  const [data, setData] = useState<TeaserData | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetcher.get<{ data: TeaserData }>("/api/provider/gamification", {
          cache: "no-store",
        });
        if (!cancelled && res?.data) setData(res.data);
      } catch {
        if (!cancelled) setData(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) return null;

  const next = data.progress_to_next_badge;
  const badge = data.current_badge;

  if (badge?.name) {
    return (
      <span
        className="text-xs font-medium text-primary truncate"
        title={t("web.provider.rewardsCard.currentBadge", { name: badge.name })}
      >
        {badge.name}
      </span>
    );
  }
  if (next && next.points_needed > 0) {
    return (
      <span
        className="text-xs font-medium text-gray-500 truncate"
        title={t("web.provider.rewardsCard.nextBadge", { name: next.badge.name })}
      >
        {t("web.provider.rewardsCard.ptsToBadge", { count: next.points_needed, name: next.badge.name })}
      </span>
    );
  }
  if (next?.badge?.name) {
    return (
      <span className="text-xs font-medium text-primary truncate">
        {t("web.provider.rewardsCard.nextBadge", { name: next.badge.name })}
      </span>
    );
  }
  const total = (data as { points?: { total?: number } }).points?.total ?? 0;
  return (
    <span className="text-xs text-gray-500 truncate">
      {t("web.provider.rewardsCard.pointsTotal", { count: total })}
    </span>
  );
}
