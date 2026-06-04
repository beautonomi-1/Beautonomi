import { SLACK_EVENT_KEYS } from "@/lib/integrations/slack/event-keys";

export type SlackRouteRule = {
  enabled: boolean;
  channel_id: string | null;
  channel_label?: string | null;
  dedupe_window_seconds: number;
};

export function defaultSlackRouting(): Record<string, SlackRouteRule> {
  const out: Record<string, SlackRouteRule> = {};
  for (const key of Object.values(SLACK_EVENT_KEYS)) {
    out[key] = {
      enabled: false,
      channel_id: null,
      dedupe_window_seconds: defaultDedupeWindowSeconds(key),
    };
  }
  return out;
}

function defaultDedupeWindowSeconds(key: string): number {
  if (key.includes(".queue.") || key.includes(".pipeline.") || key.includes("digest")) {
    return 86_400;
  }
  if (key.includes("stale") || key.includes("overdue") || key.includes("blocked") || key.includes("reconciliation")) {
    return 21_600;
  }
  if (
    key.includes("payout") ||
    key.includes("refund") ||
    key.includes("dispute") ||
    key.includes("verification") ||
    key.includes("account_deletion")
  ) {
    return 3_600;
  }
  return 900;
}

export function mergeSlackRouting(existing: unknown): Record<string, SlackRouteRule> {
  const base = defaultSlackRouting();
  if (!existing || typeof existing !== "object") return base;
  for (const [k, v] of Object.entries(existing as Record<string, unknown>)) {
    if (!base[k]) continue;
    const r = v as Record<string, unknown>;
    base[k] = {
      enabled: Boolean(r.enabled),
      channel_id: typeof r.channel_id === "string" ? r.channel_id : null,
      channel_label: typeof r.channel_label === "string" ? r.channel_label : null,
      dedupe_window_seconds:
        typeof r.dedupe_window_seconds === "number" && r.dedupe_window_seconds >= 60
          ? Math.min(86_400, r.dedupe_window_seconds)
          : base[k].dedupe_window_seconds,
    };
  }
  return base;
}
