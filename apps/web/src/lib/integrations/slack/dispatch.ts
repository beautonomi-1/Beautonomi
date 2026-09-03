import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { SLACK_EVENT_KEYS, type SlackEventKey } from "@/lib/integrations/slack/event-keys";
import { slackChatPostMessage } from "@/lib/integrations/slack/slack-api";
import { sendResendEmail } from "@/lib/integrations/resend";

/**
 * Secondary alert channel: after N consecutive Slack delivery failures for the same
 * dedupe key we email the ops list (`OPS_ALERT_EMAIL`, comma-separated) via Resend.
 * Consecutive failures are tracked in-process and cross-checked against
 * `slack_delivery_logs` so serverless instances agree.
 */
export const SLACK_EMAIL_FALLBACK_AFTER_FAILURES = 2;
const EMAIL_FALLBACK_COOLDOWN_MS = 60 * 60 * 1000;

const consecutiveFailures = new Map<string, number>();
const lastFallbackEmailAt = new Map<string, number>();

/** Test hook — clears in-process fallback counters. */
export function __resetSlackFallbackStateForTests(): void {
  consecutiveFailures.clear();
  lastFallbackEmailAt.clear();
}

function fallbackKey(p: { tenantId: string; eventKey: string; dedupeKey: string }): string {
  return `${p.tenantId}:${p.eventKey}:${p.dedupeKey}`;
}

function opsAlertRecipients(): string[] {
  return (process.env.OPS_ALERT_EMAIL ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.includes("@"));
}

async function countConsecutiveDbFailures(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  p: { tenantId: string; eventKey: string; dedupeKey: string },
): Promise<number> {
  try {
    const { data } = await supabase
      .from("slack_delivery_logs")
      .select("status")
      .eq("tenant_id", p.tenantId)
      .eq("event_key", p.eventKey)
      .eq("dedupe_key", p.dedupeKey)
      .in("status", ["sent", "failed"])
      .order("created_at", { ascending: false })
      .limit(SLACK_EMAIL_FALLBACK_AFTER_FAILURES);
    let n = 0;
    for (const row of (data ?? []) as Array<{ status: string }>) {
      if (row.status !== "failed") break;
      n += 1;
    }
    return n;
  } catch {
    return 0;
  }
}

export async function maybeSendSlackFallbackEmail(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  p: {
    tenantId: string;
    environment: string;
    eventKey: string;
    dedupeKey: string;
    title: string;
    detailLines: string[];
    actionUrl: string;
    slackError: string;
  },
): Promise<boolean> {
  const key = fallbackKey(p);
  const inMemory = (consecutiveFailures.get(key) ?? 0) + 1;
  consecutiveFailures.set(key, inMemory);
  const fromDb = await countConsecutiveDbFailures(supabase, p);
  const failures = Math.max(inMemory, fromDb);
  if (failures < SLACK_EMAIL_FALLBACK_AFTER_FAILURES) return false;

  const last = lastFallbackEmailAt.get(key) ?? 0;
  if (Date.now() - last < EMAIL_FALLBACK_COOLDOWN_MS) return false;

  const recipients = opsAlertRecipients();
  if (recipients.length === 0) {
    console.warn("[slack] delivery failed twice but OPS_ALERT_EMAIL is not set; no email fallback sent", {
      eventKey: p.eventKey,
      dedupeKey: p.dedupeKey,
    });
    return false;
  }

  const url = buildAdminDeepLink(p.actionUrl);
  const text = [
    `Slack delivery failed ${failures}x for ${p.eventKey} (${p.environment}).`,
    `Last Slack error: ${p.slackError}`,
    "",
    p.title,
    ...p.detailLines.filter(Boolean).map((l) => `- ${l}`),
    "",
    `Open in admin: ${url}`,
  ].join("\n");
  const html = `<p><strong>Slack delivery failed ${failures}x</strong> for <code>${escapeHtml(p.eventKey)}</code> (${escapeHtml(p.environment)}).<br/>Last Slack error: ${escapeHtml(p.slackError)}</p><p><strong>${escapeHtml(p.title)}</strong></p><ul>${p.detailLines
    .filter(Boolean)
    .map((l) => `<li>${escapeHtml(l)}</li>`)
    .join("")}</ul><p><a href="${url}">Open in admin</a></p>`;

  let sentAny = false;
  for (const to of recipients) {
    try {
      await sendResendEmail({
        supabase,
        tenantId: p.tenantId === "platform" ? null : p.tenantId,
        to,
        subject: `[Beautonomi ops] Slack alert undelivered: ${p.title}`,
        html,
        text,
        headers: { "X-Beautonomi-Slack-Event": p.eventKey },
      });
      sentAny = true;
    } catch (err) {
      console.error("[slack] email fallback send failed", { to, err });
    }
  }
  if (sentAny) lastFallbackEmailAt.set(key, Date.now());
  return sentAny;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

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
    [SLACK_EVENT_KEYS.SAFETY_PANIC]: [
      SLACK_EVENT_KEYS.SAFETY_USER_REPORT,
      SLACK_EVENT_KEYS.DISPUTE_NEW,
    ],
    [SLACK_EVENT_KEYS.VERIFICATION_PENDING]: [SLACK_EVENT_KEYS.DISPUTE_NEW],
    [SLACK_EVENT_KEYS.VERIFICATION_STUCK]: [SLACK_EVENT_KEYS.DISPUTE_NEW],
    [SLACK_EVENT_KEYS.FINANCE_PAYOUT_REQUESTED]: [SLACK_EVENT_KEYS.FINANCE_PAYOUT_EXCEPTION],
    [SLACK_EVENT_KEYS.PRODUCT_ORDER_PAYMENT_NOT_RECORDED]: [
      SLACK_EVENT_KEYS.FINANCE_RECONCILIATION_WARNING,
      SLACK_EVENT_KEYS.CUSTOM_OFFER_FINALIZE_FAILED,
    ],
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
    const slackError = post.error || "chat.postMessage failed";
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
      errorMessage: slackError,
    });
    await maybeSendSlackFallbackEmail(supabase, {
      tenantId: params.tenantId,
      environment: params.environment,
      eventKey: params.eventKey,
      dedupeKey: params.dedupeKey,
      title: params.title,
      detailLines: params.detailLines,
      actionUrl: params.actionUrl,
      slackError,
    });
    return;
  }

  consecutiveFailures.delete(fallbackKey(params));
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
