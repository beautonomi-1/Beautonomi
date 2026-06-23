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
/**
 * Devices not seen in this many days are almost certainly uninstalled or had
 * their subscription rotated. Pruning them keeps targeting fast and avoids
 * burning send legs on tombstones. Re-registration on next app launch restores
 * an active device immediately, so this is safe.
 */
const STALE_DEVICE_DAYS = 21;
/**
 * When computing how many devices should receive a notification, only count
 * devices active within this window. Stale/dead devices are not expected to
 * receive anything and must not inflate the "expected" denominator — otherwise
 * maxDelivered is permanently < expected (the root cause of the retry loop).
 */
const REACHABLE_DEVICE_DAYS = 21;

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

  // Stabilize the group_id across re-enqueue generations: when a reconciled
  // re-send was enqueued it carries `data._original_reconcile_group_id` pointing
  // back to the original collapse_id. Prefer that over the new collapse_id
  // written by the re-send, so dedupeKey stays constant across generations and
  // the idempotency guard in enqueueNotification remains effective.
  const payloadData = (payload as Record<string, unknown>).data;
  const origGroupIdFromData =
    payloadData && typeof payloadData === "object" && !Array.isArray(payloadData)
      ? (payloadData as Record<string, unknown>)._original_reconcile_group_id
      : undefined;
  const stableGroupId =
    typeof origGroupIdFromData === "string" && origGroupIdFromData.trim()
      ? origGroupIdFromData.trim()
      : typeof m.group_id === "string" && m.group_id.trim()
        ? m.group_id.trim()
        : null;

  return {
    app_type: appType,
    tenant_id: typeof m.tenant_id === "string" && m.tenant_id.trim() ? m.tenant_id.trim() : null,
    user_ids: userIds,
    template_key: typeof m.template_key === "string" ? m.template_key : null,
    group_id: stableGroupId,
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

    const reachableCutoff = new Date(now - REACHABLE_DEVICE_DAYS * 24 * 60 * 60_000).toISOString();

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

      // §break-loop: A reconciled re-send must never itself be re-reconciled.
      // Without this guard, each re-delivery produces a new notification_logs row
      // that the cron picks up, creating an infinite re-enqueue cycle.
      const logPayloadData =
        log.payload && typeof log.payload === "object" && !Array.isArray(log.payload)
          ? ((log.payload as Record<string, unknown>).data as Record<string, unknown> | null | undefined)
          : null;
      if (logPayloadData?.reconciled === true) continue;
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

      // §fix-device-math: Only count devices active within REACHABLE_DEVICE_DAYS.
      // Stale/uninstalled devices inflate the expected count and make
      // maxDelivered permanently < expected, which is the second compounding
      // bug in the reconcile loop. A single delivered device also satisfies a
      // single-user group — we only need at least one device to have received it.
      let deviceCountByUser = new Map<string, number>();
      for (const uid of group.userIds) {
        let deviceQuery = supabase
          .from("user_devices")
          .select("user_id")
          .eq("user_id", uid)
          .gte("last_seen", reachableCutoff);
        if (group.meta.app_type) deviceQuery = deviceQuery.eq("app_type", group.meta.app_type);
        const { data: userDevices } = await deviceQuery;
        const count = (userDevices ?? []).filter(
          (d) => typeof (d as { user_id?: string }).user_id === "string",
        ).length;
        if (count > 0) deviceCountByUser.set(uid, count);
      }

      const needsPartialRetry =
        group.userIds.length === 1
          ? (() => {
              const uid = group.userIds[0];
              const expected = deviceCountByUser.get(uid) ?? 0;
              // Any delivery to at least 1 device counts as success for a single-
              // user group. The old `maxDelivered < expected` check incorrectly
              // required delivery to ALL registered devices (even stale ones).
              return expected > 0 && maxDelivered === 0;
            })()
          : maxDelivered === 0;

      if (!needsPartialRetry) continue;

      undelivered++;

      for (const uid of group.userIds) {
        if (reEnqueued >= MAX_REENQUEUE) break;
        if ((deviceCountByUser.get(uid) ?? 0) === 0) continue;
        const res = await enqueueNotification({
          channel: "push",
          templateKey: group.meta.template_key ?? "notification",
          recipientUserId: uid,
          payload: {
            title: group.meta.title ?? "",
            message: group.meta.message ?? "",
            ...(group.meta.url ? { url: group.meta.url } : {}),
            data: {
              template_key: group.meta.template_key ?? "notification",
              reconciled: true,
              // §stable-group: carry the original group_id so that if this
              // re-sent notification is somehow scanned again, parseReconcileMeta
              // maps it back to the same groupKey and the dedupeKey below never
              // changes across re-enqueue generations.
              _original_reconcile_group_id: group.groupKey,
            },
          },
          dedupeKey: `reconcile:push:${group.groupKey}:${uid}`,
          pushAppType: group.meta.app_type ?? undefined,
          tenantId: group.meta.tenant_id ?? undefined,
        });
        if (res.inserted) reEnqueued++;
      }
    }

    // Prune stale devices (best-effort; never fails the reconcile run).
    let prunedStale = 0;
    try {
      const staleCutoff = new Date(now - STALE_DEVICE_DAYS * 24 * 60 * 60_000).toISOString();
      const { data: pruned, error: pruneErr } = await supabase
        .from("user_devices")
        .delete()
        .lt("last_seen", staleCutoff)
        .select("id");
      if (pruneErr) {
        console.warn("[reconcile-push-delivery] stale device prune failed:", pruneErr.message);
      } else {
        prunedStale = Array.isArray(pruned) ? pruned.length : 0;
      }
    } catch (pruneErr) {
      console.warn("[reconcile-push-delivery] stale device prune error:", pruneErr);
    }

    return NextResponse.json({
      ok: true,
      scanned,
      groups,
      undelivered,
      re_enqueued: reEnqueued,
      pruned_stale_devices: prunedStale,
    });
  } catch (err) {
    Sentry.captureException(err, { tags: { cron: "reconcile-push-delivery" } });
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "reconcile failed", scanned },
      { status: 500 },
    );
  }
}
