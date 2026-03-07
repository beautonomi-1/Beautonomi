"use client";

import { useEffect, useState } from "react";
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
      <span className="text-xs font-medium text-primary truncate" title={`Current badge: ${badge.name}`}>
        {badge.name}
      </span>
    );
  }
  if (next && next.points_needed > 0) {
    return (
      <span className="text-xs font-medium text-gray-500 truncate" title={`Next: ${next.badge.name}`}>
        {next.points_needed} pts to {next.badge.name}
      </span>
    );
  }
  if (next?.badge?.name) {
    return (
      <span className="text-xs font-medium text-primary truncate">
        Next: {next.badge.name}
      </span>
    );
  }
  const total = (data as { points?: { total?: number } }).points?.total ?? 0;
  return (
    <span className="text-xs text-gray-500 truncate">
      {total} pts
    </span>
  );
}
