/**
 * GET /api/cron/reconcile-push-delivery
 *
 * §Push-reliability (audit 2026-06) — delivery-status reconciliation.
 *
 * Recent must-deliver push sends are logged to `notification_logs` with reconcile
 * metadata (app_type, tenant, recipient user ids, OneSignal notification id).
 * This job re-reads the OneSignal "View notification" stats for those sends a
 * few minutes later and, when a must-deliver notification reached *nobody*
 * (successful + converted == 0 and nothing remaining), re-enqueues it into the
 * durable `notification_delivery_queue` so the existing worker retries it.
 *
 * Dual-target sends share a `collapse_id`; we group the legs and treat the
 * group as delivered if *any* leg succeeded, so an empty alias leg next to a
 * successful subscription leg never triggers a spurious retry. Re-enqueues are
 * deduped by a stable key so repeated runs over the same window are idempotent.
 *
 * Meant to run every ~10 minutes.
 */

import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { verifyCronRequest } from "@/lib/cron-auth";
import {
  isMustDeliverPushTemplate,
  oneSignalAuthorizationHeader,
} from "@/lib/notifications/onesignal";
import { resolveOneSignalCredentials, type OneSignalAppType } from "@/lib/platform/secrets";
import { enqueueNotification } from "@/lib/notifications/enqueue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ONESIGNAL_API_BASE = "https://api.onesignal.com";
/** Only inspect sends old enough for OneSignal to have finished processing. */
const MIN_AGE_MINUTES = 4;
/** ...but young enough that retrying is still useful and stats still exist. */
const MAX_AGE_MINUTES = 45;
const LOG_SCAN_LIMIT = 200;
const MAX_REENQUEUE = 200;

type ReconcileMeta = {
  app_type: OneSignalAppType | null;
  tenant_id: string | null;
  user_ids: string[];
  template_key: string | null;
  group_id: string | null;
  title: string | null;
  message: string | null;
  url: string | null;
};

type LogLeg = {
  notificationId: string;
  meta: ReconcileMeta;
};

type LogGroup = {
  groupKey: string;
  legs: LogLeg[];
  meta: ReconcileMeta;
  userIds: string[];
};

function parseReconcileMeta(payload: unknown): ReconcileMeta | null {
  if (!payload || typeof payload !== "object") return null;
  const r = (payload as Record<string, unknown>)._reconcile;
  if (!r || typeof r !== "object") return null;
  const m = r as Record<string, unknown>;
  const appType = m.app_type === "customer" || m.app_type === "provider" ? m.app_type : null;
  const userIds = Array.isArray(m.user_ids)
    ? m.user_ids.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    : [];
  return {
    app_type: appType,
    tenant_id: typeof m.tenant_id === "string" && m.tenant_id.trim() ? m.tenant_id.trim() : null,
    user_ids: userIds,
    template_key: typeof m.template_key === "string" ? m.template_key : null,
    group_id: typeof m.group_id === "string" && m.group_id.trim() ? m.group_id.trim() : null,
    title: typeof m.title === "string" ? m.title : null,
    message: typeof m.message === "string" ? m.message : null,
    url: typeof m.url === "string" ? m.url : null,
  };
}

function notificationIdOf(providerResponse: unknown): string | null {
  if (!providerResponse || typeof providerResponse !== "object") return null;
  const id = (providerResponse as Record<string, unknown>).id;
  if (typeof id === "string" && id.trim()) return id.trim();
  if (typeof id === "number") return String(id);
  return null;
}

type ViewStats = {
  ok: boolean;
  successful: number;
  converted: number;
  remaining: number;
  errored: number;
};

/** Cache credentials per app_type+tenant within a single run. */
const credCache = new Map<string, { appId: string; restKey: string } | null>();

async function getCreds(
  appType: OneSignalAppType | null,
  tenantId: string | null,
): Promise<{ appId: string; restKey: string } | null> {
  const key = `${appType ?? "default"}:${tenantId ?? ""}`;
  if (credCache.has(key)) return credCache.get(key) ?? null;
  let value: { appId: string; restKey: string } | null = null;
  try {
    const resolved = await resolveOneSignalCredentials(appType ?? undefined, {
      tenantId: tenantId ?? undefined,
    });
    const appId = resolved.appId?.replace(/^\uFEFF/, "").trim() || null;
    const restKey = resolved.restKey?.replace(/^\uFEFF/, "").trim() || null;
    if (appId && restKey) value = { appId, restKey };
  } catch {
    value = null;
  }
  credCache.set(key, value);
  return value;
}

async function fetchViewStats(
  notificationId: string,
  creds: { appId: string; restKey: string },
): Promise<ViewStats> {
  try {
    const url = `${ONESIGNAL_API_BASE}/notifications/${encodeURIComponent(
      notificationId,
    )}?app_id=${encodeURIComponent(creds.appId)}`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: oneSignalAuthorizationHeader(creds.restKey),
      },
    });
    if (!res.ok) return { ok: false, successful: 0, converted: 0, remaining: 0, errored: 0 };
    const body = (await res.json()) as Record<string, unknown>;
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
    return {
      ok: true,
      successful: num(body.successful),
      converted: num(body.converted),
      remaining: num(body.remaining),
      errored: num(body.errored),
    };
  } catch {
    return { ok: false, successful: 0, converted: 0, remaining: 0, errored: 0 };
  }
}

export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return NextResponse.json({ error: auth.error ?? "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const now = Date.now();
  const youngerThan = new Date(now - MIN_AGE_MINUTES * 60_000).toISOString();
  const olderThan = new Date(now - MAX_AGE_MINUTES * 60_000).toISOString();

  let scanned = 0;
  let groups = 0;
  let undelivered = 0;
  let reEnqueued = 0;

  try {
    const { data: logs, error } = await supabase
      .from("notification_logs")
      .select("id, payload, provider_response, channels, created_at, status")
      .eq("status", "sent")
      .gte("created_at", olderThan)
      .lte("created_at", youngerThan)
      .order("created_at", { ascending: false })
      .limit(LOG_SCAN_LIMIT);

    if (error) throw error;

    // Build groups of must-deliver push sends keyed by collapse group (dual legs) or log id.
    const groupMap = new Map<string, LogGroup>();
    for (const log of logs ?? []) {
      scanned++;
      const channels = Array.isArray(log.channels) ? (log.channels as unknown[]) : [];
      if (!channels.includes("push")) continue;
      const meta = parseReconcileMeta(log.payload);
      if (!meta) continue;
      if (!meta.template_key || !isMustDeliverPushTemplate(meta.template_key)) continue;
      if (meta.user_ids.length === 0) continue;
      const notificationId = notificationIdOf(log.provider_response);
      if (!notificationId) continue;

      const groupKey = meta.group_id ?? `log:${log.id}`;
      const existing = groupMap.get(groupKey);
      if (existing) {
        existing.legs.push({ notificationId, meta });
        for (const uid of meta.user_ids) {
          if (!existing.userIds.includes(uid)) existing.userIds.push(uid);
        }
      } else {
        groupMap.set(groupKey, {
          groupKey,
          legs: [{ notificationId, meta }],
          meta,
          userIds: [...meta.user_ids],
        });
      }
    }

    for (const group of groupMap.values()) {
      groups++;
      const creds = await getCreds(group.meta.app_type, group.meta.tenant_id);
      if (!creds) continue;

      // Inspect every leg; the group counts as delivered if any leg reached
      // someone. Only act when every leg has finished processing (remaining 0)
      // and OneSignal returned usable stats for all of them.
      let maxDelivered = 0;
      let allProcessed = true;
      let allStatsOk = true;
      for (const leg of group.legs) {
        const stats = await fetchViewStats(leg.notificationId, creds);
        if (!stats.ok) {
          allStatsOk = false;
          break;
        }
        maxDelivered = Math.max(maxDelivered, stats.successful + stats.converted);
        if (stats.remaining > 0) allProcessed = false;
      }
      if (!allStatsOk || !allProcessed) continue;
      if (maxDelivered > 0) continue; // delivered to at least one device — nothing to do

      undelivered++;

      // Re-enqueue only for recipients that currently have a registered device
      // for the relevant app, so we don't burn retries on users with no device.
      let deviceQuery = supabase
        .from("user_devices")
        .select("user_id")
        .in("user_id", group.userIds);
      if (group.meta.app_type) deviceQuery = deviceQuery.eq("app_type", group.meta.app_type);
      const { data: devices } = await deviceQuery;
      const withDevice = new Set(
        (devices ?? [])
          .map((d) => (d as { user_id?: string }).user_id)
          .filter((x): x is string => typeof x === "string"),
      );

      for (const uid of group.userIds) {
        if (reEnqueued >= MAX_REENQUEUE) break;
        if (!withDevice.has(uid)) continue;
        const res = await enqueueNotification({
          channel: "push",
          templateKey: group.meta.template_key ?? "notification",
          recipientUserId: uid,
          payload: {
            title: group.meta.title ?? "",
            message: group.meta.message ?? "",
            ...(group.meta.url ? { url: group.meta.url } : {}),
            data: { template_key: group.meta.template_key ?? "notification", reconciled: true },
          },
          dedupeKey: `reconcile:push:${group.groupKey}:${uid}`,
          pushAppType: group.meta.app_type ?? undefined,
          tenantId: group.meta.tenant_id ?? undefined,
        });
        if (res.inserted) reEnqueued++;
      }
    }

    return NextResponse.json({
      ok: true,
      scanned,
      groups,
      undelivered,
      re_enqueued: reEnqueued,
    });
  } catch (err) {
    Sentry.captureException(err, { tags: { cron: "reconcile-push-delivery" } });
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "reconcile failed", scanned },
      { status: 500 },
    );
  }
}
