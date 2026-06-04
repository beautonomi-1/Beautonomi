import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { SLACK_EVENT_KEYS, type SlackEventKey } from "@/lib/integrations/slack/event-keys";
import { slackChatPostMessage } from "@/lib/integrations/slack/slack-api";

/**
 * If an event has no Slack routing rule, try alternate keys so ops can map one channel
 * (e.g. `dispute.new`) for multiple trust/safety queues without duplicating config rows.
 */
function resolveSlackRouteRule(
  routing: Record<string, RouteRule>,
  eventKey: SlackEventKey,
): RouteRule | null {
  const direct = routing[eventKey];
  if (direct?.enabled && direct.channel_id) return direct;

  const fallbacks: Partial<Record<SlackEventKey, SlackEventKey[]>> = {
    /** Same #support-tickets as high/urgent when only those are configured */
    [SLACK_EVENT_KEYS.SUPPORT_TICKET_CREATED]: [
      SLACK_EVENT_KEYS.SUPPORT_TICKET_HIGH_CREATED,
      SLACK_EVENT_KEYS.SUPPORT_TICKET_URGENT_CREATED,
    ],
    [SLACK_EVENT_KEYS.SUPPORT_TICKET_REPLY]: [
      SLACK_EVENT_KEYS.SUPPORT_TICKET_HIGH_CREATED,
      SLACK_EVENT_KEYS.SUPPORT_TICKET_URGENT_CREATED,
    ],
    [SLACK_EVENT_KEYS.SAFETY_USER_REPORT]: [SLACK_EVENT_KEYS.DISPUTE_NEW],
    [SLACK_EVENT_KEYS.SAFETY_ADVERSE_REPORT]: [SLACK_EVENT_KEYS.DISPUTE_NEW],
    [SLACK_EVENT_KEYS.VERIFICATION_PENDING]: [SLACK_EVENT_KEYS.DISPUTE_NEW],
    [SLACK_EVENT_KEYS.VERIFICATION_STUCK]: [SLACK_EVENT_KEYS.DISPUTE_NEW],
    [SLACK_EVENT_KEYS.FINANCE_PAYOUT_REQUESTED]: [SLACK_EVENT_KEYS.FINANCE_PAYOUT_EXCEPTION],
    [SLACK_EVENT_KEYS.COMPLIANCE_ACCOUNT_DELETION_SUCCEEDED]: [SLACK_EVENT_KEYS.DISPUTE_NEW],
    [SLACK_EVENT_KEYS.COMPLIANCE_ACCOUNT_DELETION_FAILED]: [SLACK_EVENT_KEYS.DISPUTE_NEW],
  };

  for (const alt of fallbacks[eventKey] ?? []) {
    const r = routing[alt];
    if (r?.enabled && r.channel_id) return r;
  }
  return null;
}

type RouteRule = {
  enabled?: boolean;
  channel_id?: string;
  channel_label?: string;
  dedupe_window_seconds?: number;
};

function adminBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://beautonomi.co.za").replace(/\/$/, "");
}

/** Deep link into the hosted admin SPA (`/admin/...`). */
export function buildAdminDeepLink(pathOrUrl: string): string {
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) return pathOrUrl;
  const base = adminBaseUrl();
  const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  if (path.startsWith("/admin/") || path === "/admin") return `${base}${path}`;
  return `${base}/admin${path}`;
}

/**
 * Best-effort Slack notification with deduplication. Does not throw for delivery failures
 * (logs `failed` and returns).
 */
export async function tryNotifySlackEvent(params: {
  tenantId: string;
  environment: "production" | "staging" | "development";
  eventKey: SlackEventKey;
  /** Stable key for dedupe, e.g. `ticket:uuid:overdue` */
  dedupeKey: string;
  entityType: string;
  entityId: string;
  title: string;
  detailLines: string[];
  actionUrl: string;
}): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { row, error } = await loadSlackConfigForTenant(supabase, params.tenantId, params.environment);

  if (error) {
    console.error("[slack] config load error", error);
    return;
  }
  if (!row) {
    return;
  }
  if (!row.enabled || !row.bot_token_secret) {
    await logDelivery(supabase, {
      tenantId: params.tenantId,
      environment: params.environment,
      eventKey: params.eventKey,
      entityType: params.entityType,
      entityId: params.entityId,
      dedupeKey: params.dedupeKey,
      channelId: null,
      slackTs: null,
      status: "skipped_disabled",
      errorMessage: null,
    });
    return;
  }

  const routing = (row.routing || {}) as Record<string, RouteRule>;
  const rule = resolveSlackRouteRule(routing, params.eventKey);
  if (!rule?.enabled || !rule.channel_id) {
    await logDelivery(supabase, {
      tenantId: params.tenantId,
      environment: params.environment,
      eventKey: params.eventKey,
      entityType: params.entityType,
      entityId: params.entityId,
      dedupeKey: params.dedupeKey,
      channelId: null,
      slackTs: null,
      status: "skipped_no_channel",
      errorMessage: null,
    });
    return;
  }

  const windowSec = Math.min(
    86_400,
    Math.max(60, rule.dedupe_window_seconds ?? 900),
  );
  const since = new Date(Date.now() - windowSec * 1000).toISOString();

  const { data: recent } = await supabase
    .from("slack_delivery_logs")
    .select("id")
    .eq("tenant_id", params.tenantId)
    .eq("event_key", params.eventKey)
    .eq("dedupe_key", params.dedupeKey)
    .eq("status", "sent")
    .gte("created_at", since)
    .limit(1)
    .maybeSingle();

  if (recent) {
    await logDelivery(supabase, {
      tenantId: params.tenantId,
      environment: params.environment,
      eventKey: params.eventKey,
      entityType: params.entityType,
      entityId: params.entityId,
      dedupeKey: params.dedupeKey,
      channelId: rule.channel_id,
      slackTs: null,
      status: "skipped_dedupe",
      errorMessage: null,
    });
    return;
  }

  const url = buildAdminDeepLink(params.actionUrl);
  const text = `*${params.title}*\n${params.detailLines.filter(Boolean).map((l) => `• ${l}`).join("\n")}\n<${url}|Open in admin>`;

  const post = await slackChatPostMessage({
    token: row.bot_token_secret,
    channel: rule.channel_id,
    text,
  });

  if (!post.ok) {
    await logDelivery(supabase, {
      tenantId: params.tenantId,
      environment: params.environment,
      eventKey: params.eventKey,
      entityType: params.entityType,
      entityId: params.entityId,
      dedupeKey: params.dedupeKey,
      channelId: rule.channel_id,
      slackTs: null,
      status: "failed",
      errorMessage: post.error || "chat.postMessage failed",
    });
    return;
  }

  await logDelivery(supabase, {
    tenantId: params.tenantId,
    environment: params.environment,
    eventKey: params.eventKey,
    entityType: params.entityType,
    entityId: params.entityId,
    dedupeKey: params.dedupeKey,
    channelId: rule.channel_id,
    slackTs: post.ts || null,
    status: "sent",
    errorMessage: null,
  });
}

async function loadSlackConfigForTenant(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  tenantId: string,
  environment: string
) {
  const tenantResult = await supabase
    .from("slack_integration_config")
    .select("id, enabled, bot_token_secret, routing, environment, tenant_id")
    .eq("tenant_id", tenantId)
    .eq("environment", environment)
    .maybeSingle();

  if (tenantResult.error || tenantResult.data) {
    return { row: tenantResult.data, error: tenantResult.error };
  }

  const globalResult = await supabase
    .from("slack_integration_config")
    .select("id, enabled, bot_token_secret, routing, environment, tenant_id")
    .is("tenant_id", null)
    .eq("environment", environment)
    .maybeSingle();

  return { row: globalResult.data, error: globalResult.error };
}

async function logDelivery(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  p: {
    tenantId: string;
    environment: string;
    eventKey: string;
    entityType: string;
    entityId: string;
    dedupeKey: string;
    channelId: string | null;
    slackTs: string | null;
    status: "sent" | "skipped_dedupe" | "skipped_disabled" | "failed" | "skipped_no_channel";
    errorMessage: string | null;
  }
) {
  const { error } = await supabase.from("slack_delivery_logs").insert({
    tenant_id: p.tenantId,
    environment: p.environment,
    event_key: p.eventKey,
    entity_type: p.entityType,
    entity_id: p.entityId,
    dedupe_key: p.dedupeKey,
    channel_id: p.channelId,
    slack_ts: p.slackTs,
    status: p.status,
    error_message: p.errorMessage,
  });
  if (error) console.error("[slack] delivery log insert failed", error);
}
