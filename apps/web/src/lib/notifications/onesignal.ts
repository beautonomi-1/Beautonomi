/**
 * OneSignal Notification Utilities
 * 
 * Server-side utilities for sending notifications via OneSignal REST API
 * Following official documentation: https://documentation.onesignal.com/reference/rest-api-overview
 */

import { getSupabaseServer } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import * as Sentry from "@sentry/nextjs";
import { getTotalUnreadBadgeCount } from "@/lib/notifications/total-unread-badge";
import { exactIosBadgeCount } from "@/lib/notifications/exact-ios-badge-count";
import { z } from "zod";
import {
  resolveOneSignalCredentials,
  type OneSignalAppType,
  type ResolveOneSignalOptions,
} from "@/lib/platform/secrets";
import {
  isMustDeliverPushTemplate,
  resolvePushTemplateKey,
} from "@/lib/notifications/must-deliver-push";
import { buildMustDeliverFallback } from "@/lib/notifications/must-deliver-template-fallback";
import {
  applyPushUrlToPayload,
  resolvePushUrlFields,
  substituteTemplatePath,
  webUrlToRelativePath,
} from "@/lib/notifications/push-url";
import { recordSyncedBadgeCount } from "@/lib/notifications/badge-sync-state";

// OneSignal API base URL
const ONESIGNAL_API_BASE = "https://api.onesignal.com";

/**
 * OneSignal REST auth: `Authorization: Key <app api key>` (see Keys & IDs).
 * Legacy integrations sometimes stored `Basic …` or `Key …` verbatim — pass through unchanged.
 */
export function oneSignalAuthorizationHeader(restApiKey: string): string {
  const raw = restApiKey.replace(/^\uFEFF/, "").trim();
  if (!raw) return "";
  // OneSignal accepts `Key <token>` (see Keys & IDs). Pass through if already prefixed.
  if (/^(basic|key)\s+/i.test(raw)) return raw;
  return `Key ${raw}`;
}

function formatOneSignalApiErrors(responseData: unknown): string {
  if (!responseData || typeof responseData !== "object") return "Unknown error";
  const o = responseData as Record<string, unknown>;
  const err = o.errors;
  if (Array.isArray(err)) {
    return err
      .map((x) => (typeof x === "string" ? x : JSON.stringify(x)))
      .join(", ");
  }
  if (typeof err === "string" && err.trim()) return err.trim();
  const msg = o.message;
  if (typeof msg === "string" && msg.trim()) return msg.trim();
  return "Unknown error";
}

function formatOneSignalSendFailure(status: number, responseData: unknown, appId: string): string {
  const detail = formatOneSignalApiErrors(responseData);
  if (status === 401 || /authorization|api key|rest api key/i.test(detail)) {
    return `OneSignal rejected the REST API key for App ID ${appId}. Check that the saved REST API key belongs to this exact OneSignal app and is a server REST API key, not an Expo/NEXT_PUBLIC client value. OneSignal said: ${detail}`;
  }
  if (/app_id/i.test(detail) && /not found|invalid|mismatch/i.test(detail)) {
    return `OneSignal rejected App ID ${appId}. Check the App ID/key pair in Platform settings. OneSignal said: ${detail}`;
  }
  return detail;
}

/** Random collapse id shared across the dual-target legs so the device shows one banner. */
function generateCollapseId(): string {
  try {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (c?.randomUUID) return c.randomUUID();
  } catch {
    // fall through
  }
  return `bn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function eventTypeFromPayloadData(data: unknown): string {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const t = (data as { type?: unknown }).type;
    if (typeof t === "string" && t.trim()) return t;
  }
  return "notification";
}

/** Silent OS badge-only push (mark-all-read / inbox sync) — must not play sound or time-sensitive alert. */
export function isBadgeSyncPayload(payload: NotificationPayload | Record<string, unknown>): boolean {
  const p = payload as Record<string, unknown>;
  if (p.type === "badge_sync") return true;
  const data = p.data;
  return Boolean(data && typeof data === "object" && !Array.isArray(data) && (data as { type?: unknown }).type === "badge_sync");
}

function applyNotificationPayloadPassthrough(
  notificationPayload: Record<string, unknown>,
  payload: NotificationPayload | Record<string, unknown>,
): void {
  const passthrough = payload as Record<string, unknown>;
  if (passthrough.priority !== undefined) notificationPayload.priority = passthrough.priority;
  if (passthrough.ios_sound) notificationPayload.ios_sound = passthrough.ios_sound;
  if (passthrough.ios_badgeType) notificationPayload.ios_badgeType = passthrough.ios_badgeType;
  if (typeof passthrough.ios_badgeCount === "number") {
    notificationPayload.ios_badgeType = passthrough.ios_badgeType ?? "SetTo";
    notificationPayload.ios_badgeCount = exactIosBadgeCount(passthrough.ios_badgeCount);
  }
  if (passthrough.android_channel_id) notificationPayload.android_channel_id = passthrough.android_channel_id;
  if (passthrough.ios_interruption_level) {
    notificationPayload.ios_interruption_level = passthrough.ios_interruption_level;
  }
  if (passthrough.content_available !== undefined) {
    notificationPayload.content_available = passthrough.content_available;
  }
}

/**
 * Map internal payload targeting to OneSignal Create Message fields.
 *
 * OneSignal API v9/v10 does NOT allow mixing target sets in a single request
 * (https://documentation.onesignal.com/reference/create-message). The previous
 * implementation set both `include_subscription_ids` and
 * `include_external_user_ids` — OneSignal silently kept whichever one it
 * preferred, causing intermittent missed deliveries (especially for users with
 * `OneSignal.login(userId)` but no row in `user_devices`).
 *
 * Targeting strategy (in order of preference):
 *   1. External IDs + single channel  → `include_aliases.external_id` +
 *      `target_channel`. Modern alias targeting; OneSignal fans out to ALL of
 *      the user's subscribed devices, including ones we never saw via
 *      `/api/me/devices`.
 *   2. External IDs + multi channel   → legacy
 *      `include_external_user_ids` + `channel_for_external_user_ids`.
 *   3. No external IDs, push only     → `include_subscription_ids`.
 *
 * The caller should always pass `include_external_user_ids` when it has user
 * IDs available (the customer/provider apps both call
 * `OneSignal.login(user.id)` on launch).
 *
 * @see https://documentation.onesignal.com/reference/create-message
 */
function applyOneSignalTargeting(
  notification: Record<string, unknown>,
  payload: {
    include_player_ids?: string[];
    include_external_user_ids?: string[];
    filters?: unknown[];
    channels?: NotificationChannel[];
  },
): void {
  const playerIds = (payload.include_player_ids ?? []).filter(
    (x): x is string => typeof x === "string" && x.trim().length > 0,
  );
  const extIds = (payload.include_external_user_ids ?? []).filter(
    (x): x is string => typeof x === "string" && x.trim().length > 0,
  );
  const chans = (payload.channels?.length ? payload.channels : ["push"]) as string[];

  if (payload.filters && payload.filters.length > 0) {
    notification.filters = payload.filters;
  }

  const singleChannel =
    chans.length === 1 &&
    (chans[0] === "push" || chans[0] === "email" || chans[0] === "sms")
      ? chans[0]
      : null;

  // Modern path: external IDs + single channel. Reaches every subscribed
  // device for that user without needing a registered subscription_id.
  // Must run before subscription-ID targeting: mixing subscription IDs with
  // external-ID sends is invalid for OneSignal v9/v10, and we prefer alias
  // fan-out whenever we know the user's UUID (see docblock above).
  if (extIds.length > 0 && singleChannel) {
    notification.include_aliases = { external_id: extIds };
    notification.target_channel = singleChannel;
    return;
  }

  // Multi-channel external sends (push + email + sms in one request).
  if (extIds.length > 0) {
    notification.include_external_user_ids = extIds;
    if (chans.length > 0) {
      notification.channel_for_external_user_ids = chans;
    }
    // Include known player IDs as a legacy fallback so push delivery succeeds 
    // even if external_id mapping is incomplete.
    if (playerIds.length > 0) {
      notification.include_player_ids = playerIds;
    }
    return;
  }

  // No external IDs (e.g. anonymous web subscribers): subscription IDs only.
  if (playerIds.length > 0) {
    notification.include_subscription_ids = playerIds;
  }
}

/**
 * Notification channels supported by OneSignal
 */
export type NotificationChannel = "push" | "email" | "sms" | "live_activities";

const VALID_NOTIFICATION_CHANNELS: ReadonlySet<string> = new Set([
  "push",
  "email",
  "sms",
  "live_activities",
]);

export const DEFAULT_NOTIFICATION_CHANNELS: NotificationChannel[] = ["push"];

/** Coerce template/DB string lists into OneSignal channel literals (invalid entries dropped). */
export function parseNotificationChannels(
  input: readonly (string | NotificationChannel)[] | null | undefined,
  fallback: NotificationChannel[] = DEFAULT_NOTIFICATION_CHANNELS,
): NotificationChannel[] {
  const raw = input?.length ? [...input] : [...fallback];
  const out = raw.filter((c): c is NotificationChannel => VALID_NOTIFICATION_CHANNELS.has(c));
  return out.length > 0 ? out : [...fallback];
}

/**
 * Notification payload schema
 */
export const NotificationPayloadSchema = z.object({
  title: z.string(),
  message: z.string(),
  type: z.string().optional(), // e.g., "booking_confirmed", "payment_failed"
  bookingId: z.string().optional(),
  providerId: z.string().optional(),
  customerId: z.string().optional(),
  url: z.string().url().optional(),
  image: z.string().url().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  /** iOS subtitle (OneSignal `subtitle.en`) */
  subtitle: z.string().optional(),
  /** OneSignal internal message name (dashboard) */
  name: z.string().max(128).optional(),
  /** ISO 8601 UTC — `send_after` for scheduled delivery */
  send_after: z.string().optional(),
  /** 1–10; common: 5 normal, 10 high (Android) */
  priority: z.number().int().min(1).max(10).optional(),
  ios_interruption_level: z.enum(["passive", "active", "time_sensitive", "critical"]).optional(),
}).passthrough();

export type NotificationPayload = z.infer<typeof NotificationPayloadSchema>;

export interface SendNotificationResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  message?: string;
  notification_id?: string;
}

export interface NotificationLogEntry {
  event_type: string;
  recipients: string[]; // user_ids or player_ids
  payload: unknown;
  status: "sent" | "failed" | "pending" | "suppressed";
  provider_response: unknown;
  error_message?: string;
  channels?: NotificationChannel[];
}

/**
 * Verify OneSignal configuration
 */
export async function verifyOneSignalConfig(options?: ResolveOneSignalOptions): Promise<{
  configured: boolean;
  missing: string[];
}> {
  const missing: string[] = [];
  const legacy = await resolveOneSignalCredentials(undefined, options);
  if (!legacy.appId) {
    missing.push(
      "ONESIGNAL_APP_ID or ONESIGNAL_APP_ID_CUSTOMER or platform_settings.settings.onesignal.app_id"
    );
  }
  if (!legacy.restKey) {
    missing.push(
      "ONESIGNAL_REST_API_KEY (or _CUSTOMER) or platform_secrets.onesignal_rest_api_key / onesignal_rest_api_key_provider"
    );
  }

  return {
    configured: missing.length === 0,
    missing,
  };
}

/**
 * Log notification to database
 */
function uniqueNonEmptyUserIds(userIds: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of userIds) {
    const id = typeof raw === "string" ? raw.trim() : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function enrichNotificationLogPayload(
  payload: Record<string, unknown>,
  meta: { appType?: OneSignalAppType | null; tenantId?: string | null },
): Record<string, unknown> {
  return {
    ...payload,
    app_type: meta.appType ?? null,
    tenant_id: meta.tenantId ?? null,
  };
}

function reportOneSignalCredentialsMissing(meta: {
  appType?: OneSignalAppType | null;
  tenantId?: string | null;
  eventType?: string;
}): void {
  Sentry.captureMessage("OneSignal API keys not configured", {
    level: "error",
    tags: {
      onesignal: "credentials_missing",
      app_type: meta.appType ?? "unset",
    },
    extra: {
      tenant_id: meta.tenantId ?? null,
      event_type: meta.eventType ?? null,
    },
  });
}

async function logNotification(entry: NotificationLogEntry) {
  // Use service role if available (webhooks/background jobs don't have a session)
  let supabase: SupabaseClient<Database>;
  try {
    supabase = getSupabaseAdmin();
  } catch {
    supabase = await getSupabaseServer();
  }

  const { error } = await supabase.from("notification_logs").insert({
    event_type: entry.event_type,
    recipients: entry.recipients,
    payload: entry.payload as Database["public"]["Tables"]["notification_logs"]["Insert"]["payload"],
    status: entry.status,
    provider_response: entry.provider_response as Database["public"]["Tables"]["notification_logs"]["Insert"]["provider_response"],
    error_message: entry.error_message,
    channels: entry.channels || ["push"],
    created_at: new Date().toISOString(),
  });
  
  if (error) {
    console.error("Error logging notification:", error);
  }
}

type UserScopedSupabase = SupabaseClient<Database>;

function isUserDevicesUniqueViolation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "23505") return true;
  const message = error.message ?? "";
  return /unique constraint|duplicate key/i.test(message);
}

/**
 * Register a device for push notifications.
 * @param supabase — Prefer `getSupabaseAdmin()` from API routes after auth checks.
 *   User-scoped clients can fail RLS on upsert when the same OneSignal subscription id
 *   was previously registered to another account on this device.
 * @param appType - 'customer' | 'provider' for multi-app OneSignal; defaults to 'customer'.
 */
export async function registerDevice(
  supabase: UserScopedSupabase,
  userId: string,
  playerId: string,
  platform: "web" | "ios" | "android",
  appType: OneSignalAppType = "customer"
): Promise<{ success: boolean; error?: string }> {
  const normalizedPlayerId = playerId.trim();
  if (!normalizedPlayerId) {
    return { success: false, error: "Player ID is required" };
  }

  const row = {
    user_id: userId,
    onesignal_player_id: normalizedPlayerId,
    platform,
    app_type: appType,
    last_seen: new Date().toISOString(),
  };

  // Legacy rows with NULL app_type bypass composite lookups elsewhere in this flow.
  const { error: legacyDeleteError } = await supabase
    .from("user_devices")
    .delete()
    .eq("onesignal_player_id", normalizedPlayerId)
    .is("app_type", null);

  if (legacyDeleteError) {
    console.error("Error clearing legacy device row:", legacyDeleteError);
    return { success: false, error: legacyDeleteError.message };
  }

  const upsertDevice = () =>
    supabase.from("user_devices").upsert(row, { onConflict: "onesignal_player_id,app_type" });

  let { error: upsertError } = await upsertDevice();

  // Concurrent registrations can still race the upsert; clear and retry once.
  if (isUserDevicesUniqueViolation(upsertError)) {
    const { error: clearError } = await supabase
      .from("user_devices")
      .delete()
      .eq("onesignal_player_id", normalizedPlayerId)
      .eq("app_type", appType);

    if (clearError) {
      console.error("Error clearing conflicting device:", clearError);
      return { success: false, error: clearError.message };
    }

    ({ error: upsertError } = await upsertDevice());
  }

  if (upsertError) {
    const { data: existing, error: selectError } = await supabase
      .from("user_devices")
      .select("user_id")
      .eq("onesignal_player_id", normalizedPlayerId)
      .eq("app_type", appType)
      .maybeSingle();

    if (!selectError && existing?.user_id === userId) {
      return { success: true };
    }

    console.error("Error registering device:", upsertError);
    return { success: false, error: upsertError.message };
  }

  return { success: true };
}

/** Options for which OneSignal app to use (multi-app support). */
export type OneSignalSendOptions = {
  appType?: OneSignalAppType;
  /**
   * Rare override for device/template queries. Default is service-role admin so cross-user
   * lookups work from webhooks and admin broadcasts. Do not pass the admin UI session client:
   * RLS only allows each user to see their own `user_devices` rows.
   */
  supabaseClient?: SupabaseClient<Database>;
  /** Market tenant: use platform_settings / platform_secrets for this tenant (merged over global), same as admin Settings UI. */
  tenantId?: string | null;
  /** When true, do not enqueue a durable retry row on push failure (queue worker sets this). */
  skipMustDeliverRetryEnqueue?: boolean;
};

/**
 * Send notification via OneSignal REST API
 * Supports: Push, Email, SMS, Live Activities
 * When options.appType is set, uses that app's config (customer/provider); otherwise legacy single-app.
 *
 * According to: https://documentation.onesignal.com/reference/create-notification
 */
/**
 * OneSignal returns `errors.invalid_player_ids` (subscription IDs it could not
 * deliver to because the device unsubscribed / app was uninstalled) on a 200
 * response. Historically these rows lingered in `user_devices` forever, so a
 * user who reinstalled accumulated dead subscription IDs and every send wasted a
 * leg on a tombstone. Prune them best-effort, scoped to the sending app so we
 * never delete the other app's device for the same person. Never throws.
 */
async function pruneInvalidOneSignalDevices(
  responseData: Record<string, unknown>,
  appType: OneSignalAppType | undefined,
): Promise<void> {
  try {
    const errors = responseData?.errors;
    let invalidIds: string[] = [];
    if (errors && typeof errors === "object" && !Array.isArray(errors)) {
      const raw = (errors as Record<string, unknown>).invalid_player_ids;
      if (Array.isArray(raw)) {
        invalidIds = raw.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
      }
    }
    if (invalidIds.length === 0) return;

    const supabase = getSupabaseAdmin();
    let query = supabase.from("user_devices").delete().in("onesignal_player_id", invalidIds);
    if (appType === "provider") {
      query = query.eq("app_type", "provider");
    } else if (appType === "customer") {
      query = query.or("app_type.eq.customer,app_type.is.null");
    }
    const { error } = await query;
    if (error) {
      console.warn("[pruneInvalidOneSignalDevices] delete failed:", error.message);
    } else {
      console.log(
        `[pruneInvalidOneSignalDevices] pruned ${invalidIds.length} invalid device(s) for app_type=${appType ?? "any"}`,
      );
    }
  } catch (err) {
    console.warn("[pruneInvalidOneSignalDevices] unexpected error:", err);
  }
}

/**
 * Persist the absolute badge value when a push set it via `SetTo` for exactly
 * one known user. Multi-recipient `Increase` badges carry no absolute value, so
 * they are intentionally skipped. Best-effort; never throws.
 */
async function recordSetToBadgeState(
  payload: {
    ios_badgeType?: "SetTo" | "Increase";
    ios_badgeCount?: number;
    include_external_user_ids?: string[];
    _reconcileUserIds?: string[];
  },
  appType: OneSignalAppType | undefined,
): Promise<void> {
  if (appType !== "customer" && appType !== "provider") return;
  if (payload.ios_badgeType !== "SetTo" || typeof payload.ios_badgeCount !== "number") return;
  const userIds =
    payload._reconcileUserIds && payload._reconcileUserIds.length > 0
      ? payload._reconcileUserIds
      : payload.include_external_user_ids ?? [];
  if (userIds.length !== 1) return;
  await recordSyncedBadgeCount(userIds[0], appType, payload.ios_badgeCount);
}

/**
 * Native Android channel ids created by both apps in push-notifications-setup.ts.
 * OneSignal routes to a native channel via `existing_android_channel_id`. Keep
 * these strings in sync with the channel ids registered on the device.
 */
const ANDROID_CHANNEL_IDS = {
  bookings: "bookings",
  messages: "messages",
  payments: "payments",
  reminders: "reminders",
  marketing: "marketing",
  default: "default",
} as const;

/** Map a push payload's template_key/type to a native Android channel id. */
function resolveExistingAndroidChannelId(data: unknown): string {
  if (!data || typeof data !== "object") return ANDROID_CHANNEL_IDS.default;
  const d = data as Record<string, unknown>;
  const key = String(d.template_key ?? d.type ?? d.notification_type ?? "").toLowerCase();
  if (!key) return ANDROID_CHANNEL_IDS.default;
  if (key.includes("message") || key.includes("chat")) return ANDROID_CHANNEL_IDS.messages;
  if (
    key.includes("payment") ||
    key.includes("payout") ||
    key.includes("charge") ||
    key.includes("refund") ||
    key.includes("receipt") ||
    key.includes("invoice")
  ) {
    return ANDROID_CHANNEL_IDS.payments;
  }
  if (key.includes("reminder")) return ANDROID_CHANNEL_IDS.reminders;
  if (
    key.includes("promo") ||
    key.includes("marketing") ||
    key.includes("offer") ||
    key.includes("inspiration") ||
    key.includes("news")
  ) {
    return ANDROID_CHANNEL_IDS.marketing;
  }
  if (
    key.includes("booking") ||
    key.includes("appointment") ||
    key.includes("waitlist") ||
    key.includes("review") ||
    key.includes("dispute")
  ) {
    return ANDROID_CHANNEL_IDS.bookings;
  }
  return ANDROID_CHANNEL_IDS.default;
}

/**
 * iOS notification category + action buttons, mirroring the categories both apps
 * register via setNotificationCategoryAsync. Returns the APNs category id and the
 * OneSignal `buttons` so the actions render. Action taps come back through the
 * OneSignal click listener as `result.actionId`.
 */
function resolveIosActions(
  data: unknown,
  appType: OneSignalAppType | undefined,
): { category?: string; buttons?: Array<{ id: string; text: string }> } {
  if (!data || typeof data !== "object") return {};
  const d = data as Record<string, unknown>;
  const key = String(d.template_key ?? d.type ?? d.notification_type ?? "").toLowerCase();
  if (!key) return {};

  if (
    appType === "provider" &&
    (key === "new_booking" ||
      key === "booking_request" ||
      key.startsWith("provider_booking") ||
      key === "provider_new_booking")
  ) {
    return {
      category: "PROVIDER_BOOKING_REQUEST",
      buttons: [
        { id: "accept_booking", text: "Accept" },
        { id: "decline_booking", text: "Decline" },
      ],
    };
  }

  if (key.includes("message") || key.includes("chat")) {
    return {
      category: "MESSAGE",
      buttons: [{ id: "mark_read", text: "Mark as read" }],
    };
  }

  return {};
}

async function sendOneSignalNotification(
  payload: {
    include_player_ids?: string[];
    include_external_user_ids?: string[];
    filters?: unknown[];
    channels?: NotificationChannel[];
    headings?: Record<string, string>;
    contents?: Record<string, string>;
    subtitle?: Record<string, string>;
    data?: Record<string, unknown>;
    url?: string;
    big_picture?: string;
    email_subject?: string;
    email_body?: string;
    sms_from?: string;
    sms_body?: string;
    live_activities?: unknown;
    template_id?: string;
    /** OneSignal internal message name (dashboard) */
    name?: string;
    /** ISO 8601 UTC */
    send_after?: string;
    content_available?: boolean;
    mutable_content?: boolean;
    priority?: number;
    ios_sound?: string;
    android_channel_id?: string;
    ios_badgeType?: "SetTo" | "Increase";
    ios_badgeCount?: number;
    ios_interruption_level?: "passive" | "active" | "time_sensitive" | "critical";
    /** Collapse/threading id: same value across the dual-target legs so the user sees one banner. */
    collapse_id?: string;
    /** @internal Marks a single leg of a dual-target send to prevent re-splitting. */
    _dualLeg?: "sub" | "alias";
    /** @internal Original recipient user ids carried for reconcile logging (never sent to OneSignal). */
    _reconcileUserIds?: string[];
  },
  options?: OneSignalSendOptions
): Promise<SendNotificationResult> {
  const chans = payload.channels?.length ? payload.channels : ["push"] as NotificationChannel[];
  const extIds = payload.include_external_user_ids || [];

  // If we have external IDs and multiple channels, split the request into one per channel.
  // This ensures we can use the modern alias targeting (`include_aliases.external_id` + `target_channel`)
  // for each channel, which guarantees delivery to all subscribed devices for the user.
  // OneSignal API v9/v10 does not allow mixing target sets, and legacy multi-channel targeting
  // often drops push notifications if the external ID mapping isn't fully synchronized.
  if (extIds.length > 0 && chans.length > 1) {
    const results = await Promise.all(
      chans.map((channel) => {
        const singleChannelPayload = { ...payload, channels: [channel as NotificationChannel] };
        return sendOneSignalNotification(singleChannelPayload, options);
      })
    );

    const success = results.some((r) => r.success);
    const errors = results
      .filter((r) => !r.success)
      .map((r) => r.error)
      .filter(Boolean)
      .join(", ");

    return {
      success,
      error: errors || undefined,
      notification_id: results.find((r) => r.notification_id)?.notification_id,
    };
  }

  // §Push-reliability dual targeting: when a push has BOTH registered subscription
  // ids and external ids, prefer alias fan-out (reaches every subscribed device
  // for that user). Only fall back to subscription-id targeting when the alias
  // leg fails or OneSignal reports zero recipients — avoids duplicate banners on
  // Android where collapse_id does not dedupe online deliveries.
  const dualPlayerIds = (payload.include_player_ids ?? []).filter(
    (x): x is string => typeof x === "string" && x.trim().length > 0,
  );
  const dualExtIds = (payload.include_external_user_ids ?? []).filter(
    (x): x is string => typeof x === "string" && x.trim().length > 0,
  );
  const isSinglePushChannel = chans.length === 1 && chans[0] === "push";

  const readOneSignalRecipientCount = (result: SendNotificationResult): number => {
    const raw = result.data?.recipients;
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    if (typeof raw === "string" && raw.trim()) {
      const n = Number(raw);
      return Number.isFinite(n) ? n : 0;
    }
    return result.success ? 1 : 0;
  };

  const sendAliasFirstWithSubscriptionFallback = async (
    reconcileUserIds: string[],
    badgeOpts?: { ios_badgeType?: "SetTo" | "Increase"; ios_badgeCount?: number },
  ): Promise<SendNotificationResult> => {
    const collapseId = payload.collapse_id || generateCollapseId();
    const aliasLeg = await sendOneSignalNotification(
      {
        ...payload,
        include_external_user_ids: reconcileUserIds,
        include_player_ids: undefined,
        collapse_id: collapseId,
        _dualLeg: "alias",
        _reconcileUserIds: reconcileUserIds,
        ...badgeOpts,
      },
      options,
    );

    const aliasRecipients = readOneSignalRecipientCount(aliasLeg);
    if (aliasLeg.success && aliasRecipients > 0) {
      return aliasLeg;
    }

    const subLeg = await sendOneSignalNotification(
      {
        ...payload,
        include_external_user_ids: undefined,
        include_player_ids: dualPlayerIds,
        collapse_id: collapseId,
        _dualLeg: "sub",
        _reconcileUserIds: reconcileUserIds,
        ...badgeOpts,
      },
      options,
    );

    return {
      success: subLeg.success || aliasLeg.success,
      error: subLeg.success || aliasLeg.success ? undefined : (subLeg.error || aliasLeg.error),
      notification_id: subLeg.notification_id || aliasLeg.notification_id,
      data: subLeg.data ?? aliasLeg.data,
    };
  };

  if (
    !payload._dualLeg &&
    isSinglePushChannel &&
    dualExtIds.length === 1 &&
    dualPlayerIds.length > 0
  ) {
    return sendAliasFirstWithSubscriptionFallback(dualExtIds);
  }

  // Multi-recipient: alias fan-out first; subscription ids as fallback when alias
  // reaches nobody (e.g. external_id not yet bound on OneSignal).
  if (
    !payload._dualLeg &&
    isSinglePushChannel &&
    dualExtIds.length > 1 &&
    dualPlayerIds.length > 0
  ) {
    return sendAliasFirstWithSubscriptionFallback(dualExtIds, {
      ios_badgeType: "Increase",
      ios_badgeCount: 1,
    });
  }

  const appType = options?.appType;
  const resolved = await resolveOneSignalCredentials(appType, { tenantId: options?.tenantId });
  const appId = resolved.appId?.replace(/^\uFEFF/, "").trim() || null;
  const restKey = resolved.restKey?.replace(/^\uFEFF/, "").trim() || null;
  if (!appId || !restKey) {
    const eventType = eventTypeFromPayloadData(payload.data);
    console.warn("OneSignal API keys not configured. Skipping notification send.", {
      appType,
      tenantId: options?.tenantId ?? null,
      eventType,
    });
    reportOneSignalCredentialsMissing({
      appType,
      tenantId: options?.tenantId ?? null,
      eventType,
    });
    await logNotification({
      event_type: eventType,
      recipients: payload.include_player_ids || payload.include_external_user_ids || [],
      payload: enrichNotificationLogPayload(payload as Record<string, unknown>, {
        appType,
        tenantId: options?.tenantId ?? null,
      }),
      status: "failed",
      provider_response: {
        message: "OneSignal API keys not configured",
        app_type: appType ?? null,
        tenant_id: options?.tenantId ?? null,
      },
      error_message: "OneSignal API keys not configured",
      channels: parseNotificationChannels(payload.channels ?? null),
    });
    return { success: false, message: "OneSignal API keys not configured" };
  }

  // Build OneSignal notification payload
  // According to: https://documentation.onesignal.com/reference/create-notification
  const notification: Record<string, unknown> = {
    app_id: appId,
  };

  applyOneSignalTargeting(notification, payload);

  // Push notification content
  if (payload.headings) {
    notification.headings = payload.headings;
  }
  if (payload.contents) {
    notification.contents = payload.contents;
  }
  if (payload.subtitle) {
    notification.subtitle = payload.subtitle;
  }
  if (payload.big_picture) {
    notification.big_picture = payload.big_picture;
    notification.mutable_content = true;
    notification.ios_attachments = { id1: payload.big_picture };
    if (!payload.android_channel_id && process.env.ONESIGNAL_DEFAULT_ANDROID_CHANNEL_ID?.trim()) {
      notification.android_channel_id = process.env.ONESIGNAL_DEFAULT_ANDROID_CHANNEL_ID.trim();
    }
  }
  if (payload.url) {
    notification.url = payload.url;
  }
  if (payload.data) {
    notification.data = payload.data;
  }
  if (payload.content_available !== undefined) {
    notification.content_available = payload.content_available;
  }
  if (payload.mutable_content !== undefined) {
    notification.mutable_content = payload.mutable_content;
  }
  if (payload.priority !== undefined) {
    notification.priority = payload.priority;
  }
  if (payload.ios_sound) {
    notification.ios_sound = payload.ios_sound;
  }
  if (payload.ios_badgeType) {
    notification.ios_badgeType = payload.ios_badgeType;
  }
  if (typeof payload.ios_badgeCount === "number") {
    notification.ios_badgeCount = payload.ios_badgeCount;
  }
  if (payload.android_channel_id) {
    notification.android_channel_id = payload.android_channel_id;
  }
  // Route to the matching native Android channel (created by both apps) so the
  // OS can group/mute categories independently. Caller-provided ids win.
  if (!notification.existing_android_channel_id) {
    notification.existing_android_channel_id = resolveExistingAndroidChannelId(payload.data);
  }
  // iOS actionable categories + buttons (Accept/Decline, Mark as read).
  {
    const iosActions = resolveIosActions(payload.data, appType);
    if (iosActions.category && !notification.ios_category) {
      notification.ios_category = iosActions.category;
    }
    if (iosActions.buttons && iosActions.buttons.length > 0 && !notification.buttons) {
      notification.buttons = iosActions.buttons;
    }
  }
  if (payload.ios_interruption_level) {
    notification.ios_interruption_level = payload.ios_interruption_level;
  }
  if (payload.name && String(payload.name).trim()) {
    notification.name = String(payload.name).trim().slice(0, 128);
  }
  if (payload.send_after && String(payload.send_after).trim()) {
    notification.send_after = String(payload.send_after).trim();
  }
  if (payload.collapse_id && String(payload.collapse_id).trim()) {
    // Collapse on both platforms so dual-target legs render as a single banner.
    const cid = String(payload.collapse_id).trim().slice(0, 64);
    notification.collapse_id = cid;
    notification.thread_id = cid;
    notification.apns_collapse_id = cid;
  }

  // Email content
  if (payload.email_subject) {
    notification.email_subject = payload.email_subject;
  }
  if (payload.email_body) {
    notification.email_body = payload.email_body;
  }

  // SMS content
  if (payload.sms_from) {
    notification.sms_from = payload.sms_from;
  }
  if (payload.sms_body) {
    notification.sms_body = payload.sms_body;
  }

  // Live Activities (iOS)
  if (payload.live_activities) {
    notification.ios_attachments = payload.live_activities;
  }

  // OneSignal dashboard templates: Liquid reads `{{ message.custom_data.* }}` (not `data`).
  if (payload.template_id) {
    notification.template_id = payload.template_id;
    if (payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)) {
      const keys = Object.keys(payload.data as object);
      if (keys.length > 0) {
        notification.custom_data = { ...(payload.data as Record<string, unknown>) };
      }
    }
  }

  try {
    const response = await fetch(`${ONESIGNAL_API_BASE}/notifications`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: oneSignalAuthorizationHeader(restKey),
      },
      body: JSON.stringify(notification),
    });

    const rawText = await response.text();
    let responseData: Record<string, unknown> = {};
    try {
      responseData = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
    } catch {
      responseData = { errors: [rawText.slice(0, 500) || `HTTP ${response.status}`] };
    }

    if (!response.ok) {
      console.error("OneSignal API error:", responseData);
      const errMsg = formatOneSignalSendFailure(response.status, responseData, appId);
      await logNotification({
        event_type: eventTypeFromPayloadData(payload.data),
        recipients: payload.include_player_ids || payload.include_external_user_ids || [],
        payload,
        status: "failed",
        provider_response: responseData,
        error_message: errMsg,
        channels: parseNotificationChannels(payload.channels ?? null),
      });
      return {
        success: false,
        error: errMsg,
      };
    }

    // Attach reconcile metadata so the reconcile-push-delivery cron can later
    // check OneSignal delivery stats for this send and re-enqueue critical
    // notifications that reached nobody. Kept inside the jsonb payload so we
    // don't need a notification_logs schema change.
    //
    // Badge-sync payloads are ephemeral: they carry no visible content and are
    // superseded by the next send. Attaching _reconcile would make the cron
    // re-deliver a stale badge count, which is the root cause of the reconcile
    // feedback loop. Skip it for any silent/badge-only push.
    const isBadgeSync = isBadgeSyncPayload(payload);
    const reconcileUserIds =
      payload._reconcileUserIds && payload._reconcileUserIds.length > 0
        ? payload._reconcileUserIds
        : payload.include_external_user_ids ?? [];
    const reconcileData =
      payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)
        ? (payload.data as Record<string, unknown>)
        : null;
    const sentLogPayload = {
      ...payload,
      ...(!isBadgeSync
        ? {
            _reconcile: {
              app_type: appType ?? null,
              tenant_id: options?.tenantId ?? null,
              user_ids: reconcileUserIds,
              template_key: resolvePushTemplateKey(reconcileData),
              group_id: payload.collapse_id ?? null,
              title: payload.headings?.en ?? null,
              message: payload.contents?.en ?? null,
              url: payload.url ?? null,
            },
          }
        : {}),
      ...(responseData.warnings != null ? { onesignal_warnings: responseData.warnings } : {}),
    };
    await logNotification({
      event_type: eventTypeFromPayloadData(payload.data),
      recipients: payload.include_player_ids || payload.include_external_user_ids || [],
      payload: sentLogPayload,
      status: "sent",
      provider_response: responseData,
      channels: parseNotificationChannels(payload.channels ?? null),
    });

    // Prune any subscription IDs OneSignal flagged as invalid on this send so
    // dead/uninstalled devices don't accumulate in user_devices.
    void pruneInvalidOneSignalDevices(responseData, appType);

    // Keep the badge_sync dedup state authoritative: any single-recipient SetTo
    // send (regular notifications included) moves the device's absolute badge, so
    // record it here. Otherwise a later silent badge_sync with the same numeric
    // value would be wrongly skipped, leaving a stale badge on a killed app.
    void recordSetToBadgeState(payload, appType);

    const notificationIdRaw = responseData.id;
    const notification_id =
      typeof notificationIdRaw === "string"
        ? notificationIdRaw
        : typeof notificationIdRaw === "number"
          ? String(notificationIdRaw)
          : "";

    return {
      success: true,
      data: responseData,
      notification_id,
    };
  } catch (error) {
    console.error("Error sending OneSignal notification:", error);
    await logNotification({
      event_type: eventTypeFromPayloadData(payload.data),
      recipients: payload.include_player_ids || payload.include_external_user_ids || [],
      payload,
      status: "failed",
      provider_response: { message: error instanceof Error ? error.message : "Unknown error" },
      error_message: error instanceof Error ? error.message : "Unknown error",
      channels: parseNotificationChannels(payload.channels ?? null),
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Send notification to a single user.
 * @param options.appType - When set, only devices for that app (customer/provider) are used and that app's OneSignal config is used.
 */
export async function sendToUser(
  userId: string,
  payload: NotificationPayload,
  channels: readonly (string | NotificationChannel)[] = DEFAULT_NOTIFICATION_CHANNELS,
  options?: OneSignalSendOptions
): Promise<SendNotificationResult> {
  const normalizedChannels = parseNotificationChannels(channels);
  // Device rows live under RLS (owner-only). Server sends (webhooks, provider APIs, cron) have no
  // customer session — always use admin for user_devices reads so subscription targeting works.
  const supabase = options?.supabaseClient ?? getSupabaseAdmin();

  let query = supabase
    .from("user_devices")
    .select("onesignal_player_id")
    .eq("user_id", userId);

  if (options?.appType === "provider") {
    query = query.eq("app_type", "provider");
  } else if (options?.appType === "customer") {
    query = query.or("app_type.eq.customer,app_type.is.null");
  }

  const { data: devices } = await query;
  const playerIds =
    (devices as { onesignal_player_id?: string | null }[] | null)
      ?.map((d) => d.onesignal_player_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0) ?? [];

  const badgeSync = isBadgeSyncPayload(payload);
  const notificationPayload: Record<string, unknown> = {
    include_external_user_ids: [userId],
    channels: normalizedChannels,
    data: payload.data || {},
  };
  // Silent badge_sync: OneSignal requires omitting contents/headings when
  // content_available is true — otherwise iOS/Android show an empty banner.
  if (!badgeSync) {
    notificationPayload.headings = { en: payload.title };
    notificationPayload.contents = { en: payload.message };
  }

  if (normalizedChannels.includes("email")) {
    notificationPayload.email_subject = payload.title;
    notificationPayload.email_body = payload.message;
  }
  if (normalizedChannels.includes("sms")) {
    notificationPayload.sms_body = payload.message;
  }
  if (payload.url) {
    const rawUrl = String(payload.url);
    const relative = rawUrl.startsWith("http") ? webUrlToRelativePath(rawUrl) : rawUrl;
    applyPushUrlToPayload(
      notificationPayload,
      resolvePushUrlFields(relative, {}, { appType: options?.appType }),
    );
  }
  if (payload.image) notificationPayload.big_picture = payload.image;
  if (normalizedChannels.includes("push")) {
    if (playerIds.length > 0) {
      notificationPayload.include_player_ids = playerIds;
    }
    if (!badgeSync) {
      notificationPayload.ios_sound = notificationPayload.ios_sound ?? "default";
      notificationPayload.priority = notificationPayload.priority ?? 10;
      notificationPayload.ios_interruption_level = "time_sensitive";
    }
    // §Badge-accuracy: exact unread (0 after mark-all-read). Works with alias-only targeting too.
    const passthroughBadge = (payload as Record<string, unknown>).ios_badgeCount;
    if (typeof passthroughBadge !== "number") {
      const unread = await getTotalUnreadBadgeCount(userId, options?.appType ?? "customer");
      notificationPayload.ios_badgeType = "SetTo";
      notificationPayload.ios_badgeCount = exactIosBadgeCount(unread);
    }
  }
  applyNotificationPayloadPassthrough(notificationPayload, payload);

  const directResult = await sendOneSignalNotification(notificationPayload, options);

  if (
    !directResult.success &&
    normalizedChannels.includes("push") &&
    !options?.skipMustDeliverRetryEnqueue
  ) {
    const data = (payload.data ?? {}) as Record<string, unknown>;
    const templateKey = resolvePushTemplateKey(data, payload.type);
    if (templateKey && isMustDeliverPushTemplate(templateKey)) {
      const bookingId = typeof data.booking_id === "string" ? data.booking_id : null;
      await enqueueMustDeliverChannelsRetry({
        templateKey,
        userIds: [userId],
        channels: ["push"],
        bookingId,
        tenantId: options?.tenantId ?? null,
        pushAppType: options?.appType ?? null,
        title: payload.title,
        body: payload.message,
        emailSubject: payload.title,
        emailBody: payload.message,
        smsBody: payload.message,
        data: { template_key: templateKey, ...data },
        url: payload.url,
        dedupePrefix: "fallback",
      });
    }
  }

  return directResult;
}

/**
 * Send notification to multiple users.
 * @param options.appType - When set, only devices for that app are used and that app's OneSignal config is used.
 */
export async function sendToUsers(
  userIds: string[],
  payload: NotificationPayload,
  channels: readonly (string | NotificationChannel)[] = DEFAULT_NOTIFICATION_CHANNELS,
  options?: OneSignalSendOptions
): Promise<SendNotificationResult> {
  const targetUserIds = uniqueNonEmptyUserIds(userIds);
  if (targetUserIds.length === 0) {
    return { success: false, message: "No recipients" };
  }
  const normalizedChannels = parseNotificationChannels(channels);
  const supabase = options?.supabaseClient ?? getSupabaseAdmin();

  let query = supabase
    .from("user_devices")
    .select("onesignal_player_id, user_id")
    .in("user_id", targetUserIds);

  if (options?.appType === "provider") {
    query = query.eq("app_type", "provider");
  } else if (options?.appType === "customer") {
    query = query.or("app_type.eq.customer,app_type.is.null");
  }

  const { data: devices } = await query;
  const playerIds =
    (devices as { onesignal_player_id?: string | null }[] | null)
      ?.map((d) => d.onesignal_player_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0) ?? [];

  const notificationPayload: Record<string, unknown> = {
    include_external_user_ids: targetUserIds,
    channels: normalizedChannels,
    headings: { en: payload.title },
    contents: { en: payload.message },
    data: payload.data || {},
  };

  if (normalizedChannels.includes("email")) {
    notificationPayload.email_subject = payload.title;
    notificationPayload.email_body = payload.message;
  }
  if (normalizedChannels.includes("sms")) {
    notificationPayload.sms_body = payload.message;
  }
  if (payload.url) {
    const rawUrl = String(payload.url);
    const relative = rawUrl.startsWith("http") ? webUrlToRelativePath(rawUrl) : rawUrl;
    applyPushUrlToPayload(
      notificationPayload,
      resolvePushUrlFields(relative, {}, { appType: options?.appType }),
    );
  }
  if (payload.image) notificationPayload.big_picture = payload.image;
  if (normalizedChannels.includes("push")) {
    if (playerIds.length > 0) {
      notificationPayload.include_player_ids = playerIds;
      if (targetUserIds.length > 1) {
        notificationPayload.ios_interruption_level = "time_sensitive";
      }
    }
    // §Badge-accuracy: exact SetTo for one user; Increase when fan-out can't carry per-user totals.
    if (targetUserIds.length === 1) {
      const passthroughBadge = (payload as Record<string, unknown>).ios_badgeCount;
      if (typeof passthroughBadge !== "number") {
        const unread = await getTotalUnreadBadgeCount(targetUserIds[0], options?.appType ?? "customer");
        notificationPayload.ios_badgeType = "SetTo";
        notificationPayload.ios_badgeCount = exactIosBadgeCount(unread);
      }
    } else if (playerIds.length > 0) {
      notificationPayload.ios_badgeType = "Increase";
      notificationPayload.ios_badgeCount = 1;
    }
  }
  if (typeof payload.subtitle === "string" && payload.subtitle.trim()) {
    notificationPayload.subtitle = { en: payload.subtitle.trim() };
  }
  if (typeof payload.name === "string" && payload.name.trim()) {
    notificationPayload.name = payload.name.trim().slice(0, 128);
  }
  if (typeof payload.send_after === "string" && payload.send_after.trim()) {
    notificationPayload.send_after = payload.send_after.trim();
  }
  applyNotificationPayloadPassthrough(notificationPayload, payload);

  return await sendOneSignalNotification(notificationPayload, options);
}

/**
 * Send notification to a segment (using OneSignal filters).
 * @param options.appType - Which OneSignal app to use when using two apps.
 */
export async function sendToSegment(
  segmentQuery: Record<string, string | number | boolean>,
  payload: NotificationPayload,
  channels: readonly (string | NotificationChannel)[] = DEFAULT_NOTIFICATION_CHANNELS,
  options?: OneSignalSendOptions
): Promise<SendNotificationResult> {
  const normalizedChannels = parseNotificationChannels(channels);
  const filters = Object.entries(segmentQuery).map(([key, value]) => ({
    field: key,
    relation: "=",
    value: String(value),
  }));

  const notificationPayload: Record<string, unknown> = {
    filters,
    channels: normalizedChannels,
    headings: { en: payload.title },
    contents: { en: payload.message },
    data: payload.data || {},
  };

  if (normalizedChannels.includes("email")) {
    notificationPayload.email_subject = payload.title;
    notificationPayload.email_body = payload.message;
  }
  if (normalizedChannels.includes("sms")) {
    notificationPayload.sms_body = payload.message;
  }
  if (payload.url) {
    const rawUrl = String(payload.url);
    const relative = rawUrl.startsWith("http") ? webUrlToRelativePath(rawUrl) : rawUrl;
    applyPushUrlToPayload(
      notificationPayload,
      resolvePushUrlFields(relative, {}, { appType: options?.appType }),
    );
  }
  if (payload.image) notificationPayload.big_picture = payload.image;
  if (normalizedChannels.includes("push")) {
    notificationPayload.ios_interruption_level = "time_sensitive";
  }

  return await sendOneSignalNotification(notificationPayload, options);
}

/**
 * Get notification template by key with tenant-aware resolution.
 * Priority: tenant-specific template > global template (tenant_id IS NULL).
 * Uses `.maybeSingle()` per query to avoid .single() throwing when no row is found.
 *
 * @param key - Template key, e.g. "booking_confirmed"
 * @param supabaseClient - Optional admin/server client for background jobs.
 * @param tenantId - Optional tenant ID to check for tenant-specific overrides first.
 */
/** Row shape from `notification_templates` (used by template sends). */
export type NotificationTemplateRow = Record<string, unknown> & {
  title?: string | null;
  body?: string | null;
  email_subject?: string | null;
  email_body?: string | null;
  sms_body?: string | null;
  url?: string | null;
  image?: string | null;
  channels?: string[] | null;
  onesignal_template_id?: string | null;
  enabled?: boolean | null;
};

export async function getNotificationTemplate(
  key: string,
  supabaseClient?: SupabaseClient<Database>,
  tenantId?: string | null,
): Promise<NotificationTemplateRow | null> {
  const supabase = supabaseClient ?? getSupabaseAdmin();

  // 1. If tenantId provided, try tenant-specific template first
  if (tenantId) {
    const { data: tenantTemplate } = await supabase
      .from("notification_templates")
      .select("*")
      .eq("key", key)
      .eq("tenant_id", tenantId)
      .eq("enabled", true)
      .maybeSingle();

    if (tenantTemplate) return tenantTemplate as NotificationTemplateRow;
  }

  // 2. Fall back to global template (tenant_id IS NULL)
  const { data: globalTemplate } = await supabase
    .from("notification_templates")
    .select("*")
    .eq("key", key)
    .is("tenant_id", null)
    .eq("enabled", true)
    .maybeSingle();

  return (globalTemplate ?? null) as NotificationTemplateRow | null;
}

/** Extended send options including tenant scope for template resolution. */
export type SendTemplateOptions = OneSignalSendOptions & {
  /** Tenant ID used to prefer tenant-specific templates over global ones. */
  tenantId?: string | null;
  /**
   * When true, suppress the automatic in-app bell row insert. Use this when the
   * caller inserts its own in-app row (e.g. with a richer action_url or dedupe
   * key) so the same event does not create two bell entries.
   */
  skipInApp?: boolean;
  /** Fallback copy when the DB template row is missing but push is must-deliver. */
  fallbackTitle?: string;
  fallbackBody?: string;
  fallbackUrl?: string;
};

/**
 * Send notification using a template.
 * @param options.appType - When set, only devices for that app are used and that app's OneSignal config is used.
 * @param options.tenantId - Used to resolve tenant-specific template overrides before the global fallback.
 */
export async function sendTemplateNotification(
  templateKey: string,
  userIds: string[],
  variables: Record<string, string> = {},
  channels: readonly (string | NotificationChannel)[] = DEFAULT_NOTIFICATION_CHANNELS,
  options?: SendTemplateOptions
): Promise<SendNotificationResult> {
  userIds = uniqueNonEmptyUserIds(userIds);
  if (userIds.length === 0) {
    return { success: false, message: "No recipients" };
  }
  const requestedFilter = parseNotificationChannels(channels);
  const templateClient = options?.supabaseClient ?? getSupabaseAdmin();
  const resolvedTenantId =
    options?.tenantId ??
    (typeof variables.tenant_id === "string" && variables.tenant_id.trim()
      ? variables.tenant_id.trim()
      : null);

  const template = await getNotificationTemplate(
    templateKey,
    templateClient,
    resolvedTenantId,
  );

  type ResolvedTemplate = {
    title: string;
    body: string;
    emailSubject: string;
    emailBody: string;
    smsBody: string;
    urlPath: string;
    image: string;
    channels: NotificationChannel[];
    onesignalTemplateId?: string;
    usedFallback: boolean;
  };

  let resolved: ResolvedTemplate;

  if (!template) {
    if (!isMustDeliverPushTemplate(templateKey)) {
      return {
        success: false,
        error: `Template ${templateKey} not found or disabled`,
      };
    }
    const fallback = buildMustDeliverFallback(templateKey, variables, options);
    if (!fallback) {
      return {
        success: false,
        error: `Template ${templateKey} not found or disabled`,
      };
    }
    resolved = {
      title: fallback.title,
      body: fallback.body,
      emailSubject: fallback.title,
      emailBody: fallback.body,
      smsBody: fallback.body,
      urlPath: fallback.url,
      image: "",
      channels: fallback.channels.filter((c) => requestedFilter.includes(c)),
      usedFallback: true,
    };
    if (resolved.channels.length === 0) {
      resolved.channels = requestedFilter.includes("push") ? (["push"] as NotificationChannel[]) : requestedFilter;
    }
  } else {
    resolved = {
      title: template.title || "",
      body: template.body || "",
      emailSubject: template.email_subject || template.title || "",
      emailBody: template.email_body || template.body || "",
      smsBody: template.sms_body || template.body || "",
      urlPath: template.url ? String(template.url) : "",
      image: template.image ? String(template.image) : "",
      channels:
        template.channels && template.channels.length > 0
          ? template.channels.filter((ch): ch is NotificationChannel => {
              const c = ch as NotificationChannel;
              return (
                (c === "push" || c === "email" || c === "sms" || c === "live_activities") &&
                requestedFilter.includes(c)
              );
            })
          : requestedFilter,
      onesignalTemplateId: template.onesignal_template_id ?? undefined,
      usedFallback: false,
    };
  }

  let title = resolved.title;
  let body = resolved.body;
  let emailSubject = resolved.emailSubject;
  let emailBody = resolved.emailBody;
  let smsBody = resolved.smsBody;

  Object.entries(variables).forEach(([key, value]) => {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    title = title.replace(regex, value);
    body = body.replace(regex, value);
    emailSubject = emailSubject.replace(regex, value);
    emailBody = emailBody.replace(regex, value);
    smsBody = smsBody.replace(regex, value);
  });

  if (templateKey === "service_started") {
    const { finalizeServiceStartedNotificationBody } = await import(
      "@/lib/bookings/resolve-booking-service-duration"
    );
    const dur = variables.service_duration ?? "";
    body = finalizeServiceStartedNotificationBody(body, dur);
    emailBody = finalizeServiceStartedNotificationBody(emailBody, dur);
    smsBody = finalizeServiceStartedNotificationBody(smsBody, dur);
  }

  const templateUrlRelative = resolved.urlPath
    ? substituteTemplatePath(resolved.urlPath, variables)
    : "";
  const pushUrlFields = resolvePushUrlFields(templateUrlRelative, variables, {
    appType: options?.appType,
  });

  let templateImage = resolved.image;
  Object.entries(variables).forEach(([key, value]) => {
    templateImage = templateImage.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  });

  const activeChannels: NotificationChannel[] = resolved.channels;

  // Track what was originally requested so we can observe (and log) any push
  // that gets silently dropped by preference gating or quiet hours below.
  const pushRequested = activeChannels.includes("push");
  let quietHoursSuppressedPush = false;

  let channelsToSend: NotificationChannel[] = [...activeChannels];
  if ((options?.appType === "customer" || options?.appType === "provider") && userIds.length > 0) {
    const nonPref = channelsToSend.filter((c) => c !== "email" && c !== "sms" && c !== "push");
    const triad = channelsToSend.filter((c): c is "email" | "sms" | "push" =>
      c === "email" || c === "sms" || c === "push"
    );
    let allowed: ("email" | "sms" | "push")[];
    if (options.appType === "provider") {
      // Providers store opt-outs on user_profiles.notification_preferences too
      // (per provider user — owner or staff). Historically these were stored but
      // never enforced on send; now they gate email/sms/push the same way the
      // customer prefs do, with must-deliver bypass below.
      const { intersectChannelsForProviderRecipients } = await import(
        "@/lib/notifications/provider-notification-channels"
      );
      allowed = (await intersectChannelsForProviderRecipients(
        getSupabaseAdmin(),
        userIds,
        templateKey,
        triad
      )).filter((c): c is "email" | "sms" | "push" =>
        c === "email" || c === "sms" || c === "push",
      );
    } else {
      const { intersectChannelsForCustomerRecipients } = await import(
        "@/lib/notifications/customer-notification-channels"
      );
      allowed = (await intersectChannelsForCustomerRecipients(
        getSupabaseAdmin(),
        userIds,
        templateKey,
        triad
      )).filter((c): c is "email" | "sms" | "push" =>
        c === "email" || c === "sms" || c === "push",
      );
    }
    // Must-deliver pushes (everything except marketing/promo) bypass preference
    // gating so transactional notifications reach the device. Email/SMS prefs
    // are still respected.
    if (
      isMustDeliverPushTemplate(templateKey) &&
      triad.includes("push") &&
      !allowed.includes("push")
    ) {
      allowed.push("push");
    }
    channelsToSend = [...nonPref, ...allowed];
  }

  // Per-user email/SMS gating (Option A). Email/SMS are delivered per-recipient
  // through the durable Resend/Twilio queue, so — unlike the single OneSignal
  // push payload, which must intersect preferences across all recipients — each
  // recipient is gated individually. One opted-out user no longer suppresses the
  // channel for everyone else when a template fans out to many recipients.
  //
  // `emailSmsByUser === null` means no preference gating applies (e.g. admin /
  // no-appType sends) → every recipient gets exactly what was requested.
  const requestedEmailSms = activeChannels.filter(
    (c): c is "email" | "sms" => c === "email" || c === "sms",
  );
  let emailSmsByUser: Map<string, ("email" | "sms")[]> | null = null;
  if (
    requestedEmailSms.length > 0 &&
    (options?.appType === "customer" || options?.appType === "provider") &&
    userIds.length > 0
  ) {
    let perUser: Map<string, ("push" | "email" | "sms" | "whatsapp")[]>;
    if (options.appType === "provider") {
      const { resolveChannelsPerProviderRecipient } = await import(
        "@/lib/notifications/provider-notification-channels"
      );
      perUser = await resolveChannelsPerProviderRecipient(
        getSupabaseAdmin(),
        userIds,
        templateKey,
        requestedEmailSms,
      );
    } else {
      const { resolveChannelsPerCustomerRecipient } = await import(
        "@/lib/notifications/customer-notification-channels"
      );
      perUser = await resolveChannelsPerCustomerRecipient(
        getSupabaseAdmin(),
        userIds,
        templateKey,
        requestedEmailSms,
      );
    }
    emailSmsByUser = new Map();
    for (const uid of userIds) {
      const allowedForUser = (perUser.get(uid) ?? []).filter(
        (c): c is "email" | "sms" => c === "email" || c === "sms",
      );
      if (allowedForUser.length > 0) emailSmsByUser.set(uid, allowedForUser);
    }
  }
  // Is there any email/SMS to deliver after per-user gating? Drives the
  // "nothing to send" guards below so an email-only recipient is not dropped
  // just because push was gated off.
  const hasEmailSmsWork =
    requestedEmailSms.length > 0 &&
    userIds.length > 0 &&
    (emailSmsByUser ? emailSmsByUser.size > 0 : true);

  // Quiet hours enforcement: suppress push during quiet hours for marketing
  // only; must-deliver transactional pushes always go through.
  if (
    channelsToSend.includes("push") &&
    userIds.length > 0 &&
    !isMustDeliverPushTemplate(templateKey)
  ) {
    try {
      const supabaseAdmin = getSupabaseAdmin();
      const [{ data: profiles }, { data: tzRows }] = await Promise.all([
        supabaseAdmin
          .from("user_profiles")
          .select("user_id, notification_preferences")
          .in("user_id", userIds),
        supabaseAdmin.from("users").select("id, timezone").in("id", userIds),
      ]);

      if (profiles && profiles.length > 0) {
        const tzByUser = new Map<string, string>(
          (tzRows ?? []).map((u) => [
            u.id as string,
            (typeof u.timezone === "string" && u.timezone.trim()) || "Africa/Johannesburg",
          ]),
        );
        const now = new Date();
        // Quiet hours are wall-clock for the recipient, so evaluate "now" in
        // each user's IANA timezone rather than the Vercel/server timezone —
        // previously a user in another region was silenced at the wrong hours.
        const hhmmInTz = (tz: string): string => {
          try {
            return new Intl.DateTimeFormat("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
              timeZone: tz,
            }).format(now);
          } catch {
            return new Intl.DateTimeFormat("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
              timeZone: "Africa/Johannesburg",
            }).format(now);
          }
        };
        const allInQuietHours = profiles.every((p) => {
          const prefs = p.notification_preferences as Record<string, unknown> | null;
          if (!prefs?.quiet_hours_enabled) return false;
          const tz = tzByUser.get(p.user_id as string) ?? "Africa/Johannesburg";
          const nowHHMM = hhmmInTz(tz);
          const start = String(prefs.quiet_hours_start ?? "22:00");
          const end = String(prefs.quiet_hours_end ?? "07:00");
          if (start <= end) {
            return nowHHMM >= start && nowHHMM < end;
          }
          return nowHHMM >= start || nowHHMM < end;
        });
        if (allInQuietHours) {
          channelsToSend = channelsToSend.filter((c) => c !== "push");
          quietHoursSuppressedPush = true;
        }
      }
    } catch {
      // Non-blocking: if quiet hours check fails, send push anyway
    }
  }

  // Observability: if push was requested but dropped by gating, record it so we
  // can tell suppression apart from delivery failures or "nothing fired" in logs.
  if (pushRequested && !channelsToSend.includes("push")) {
    const reason = quietHoursSuppressedPush ? "quiet_hours" : "customer_preferences";
    void logNotification({
      event_type: templateKey,
      recipients: userIds,
      payload: {
        template_key: templateKey,
        channels_requested: activeChannels,
        channels_after_gating: channelsToSend,
      },
      status: "suppressed",
      provider_response: { reason },
      error_message: `push suppressed (${reason})`,
      channels: ["push"],
    });
  }

  if (channelsToSend.length === 0 && !hasEmailSmsWork) {
    return {
      success: true,
      notification_id: quietHoursSuppressedPush ? "suppressed-quiet-hours" : "suppressed-preferences",
      message: quietHoursSuppressedPush
        ? "Push suppressed: all recipients in quiet hours"
        : "No external channels enabled for recipients (preferences)",
    };
  }

  // Option A — email & SMS template channels are delivered through the durable
  // Resend/Twilio queue rather than OneSignal. We keep no OneSignal email/SMS
  // subscriptions (the product is push-only on OneSignal), so routing these
  // through the queue is the only path that actually delivers. The cron worker
  // resolves each recipient's email/phone from `users` and applies retry + DLQ.
  // Push + in-app continue via OneSignal / the in-app inbox below.
  // OneSignal must never carry email/SMS in this product — strip them so the
  // payload below is push-only, regardless of recipient count.
  channelsToSend = channelsToSend.filter((c) => c !== "email" && c !== "sms");
  let emailSmsEnqueued = false;
  if (hasEmailSmsWork) {
    // Per-user recipient list: gated map when preferences apply, otherwise every
    // recipient gets exactly the requested email/SMS channels.
    const recipients = emailSmsByUser
      ? Array.from(emailSmsByUser.entries()).map(([userId, channels]) => ({ userId, channels }))
      : userIds.map((userId) => ({ userId, channels: requestedEmailSms }));
    if (recipients.length > 0) {
      const bookingId = (variables as { booking_id?: string })?.booking_id ?? null;
      const { enqueueTemplateEmailSmsChannels } = await import(
        "@/lib/notifications/enqueue-template-channels"
      );
      await enqueueTemplateEmailSmsChannels(
        {
          templateKey,
          recipients,
          bookingId,
          tenantId: options?.tenantId ?? null,
          title,
          body,
          emailSubject,
          emailBody,
          smsBody,
          data: { template_key: templateKey, ...variables },
          url: pushUrlFields.actionPath || undefined,
        },
        options?.supabaseClient,
      );
      emailSmsEnqueued = true;
    }
  }

  const whatsappRequested =
    (template?.channels?.includes("whatsapp") ?? false) &&
    (!channels?.length || (channels as string[]).includes("whatsapp"));
  if (whatsappRequested && userIds.length > 0) {
    const { isWhatsAppNotificationsEnabled, buildOrdinalContentVariables } = await import(
      "@/lib/whatsapp/config"
    );
    const waEnabled = await isWhatsAppNotificationsEnabled(
      getSupabaseAdmin(),
      resolvedTenantId,
    );
    if (waEnabled && template) {
      const tpl = template as Record<string, unknown>;
      const contentSid = String(tpl.whatsapp_content_sid ?? "").trim();
      const waStatus = String(tpl.whatsapp_template_status ?? "unknown");
      const waCategory = String(tpl.whatsapp_category ?? "utility");
      const waBodyRaw = String(tpl.whatsapp_body ?? tpl.sms_body ?? body);
      let waBody = waBodyRaw;
      Object.entries(variables).forEach(([key, value]) => {
        waBody = waBody.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
      });
      const contentVars = buildOrdinalContentVariables(
        tpl.whatsapp_content_variables as Array<{ ordinal?: number; var?: string; sample?: string }>,
        variables as Record<string, string>,
      );

      let waRecipients: Array<{ userId: string; channels: ("whatsapp")[] }> = userIds.map((uid) => ({
        userId: uid,
        channels: ["whatsapp"] as const,
      }));

      if (options?.appType === "customer" || options?.appType === "provider") {
        const { resolveChannelsPerCustomerRecipient } = await import(
          "@/lib/notifications/customer-notification-channels"
        );
        const { resolveChannelsPerProviderRecipient } = await import(
          "@/lib/notifications/provider-notification-channels"
        );
        const perUser =
          options.appType === "provider"
            ? await resolveChannelsPerProviderRecipient(
                getSupabaseAdmin(),
                userIds,
                templateKey,
                ["whatsapp"],
              )
            : await resolveChannelsPerCustomerRecipient(
                getSupabaseAdmin(),
                userIds,
                templateKey,
                ["whatsapp"],
              );
        waRecipients = [];
        for (const uid of userIds) {
          const allowed = (perUser.get(uid) ?? []).filter((c) => c === "whatsapp");
          if (allowed.length > 0) waRecipients.push({ userId: uid, channels: ["whatsapp"] });
        }
      }

      const waterfall = Array.isArray(tpl.channel_waterfall)
        ? (tpl.channel_waterfall as string[])
        : [];
      const whatsappFirst = waterfall.length === 0 || waterfall[0] === "whatsapp";

      if (whatsappFirst && waRecipients.length > 0 && (contentSid || waBody)) {
        if (!["paused", "disabled", "rejected"].includes(waStatus)) {
          const { enqueueTemplateEmailSmsChannels } = await import(
            "@/lib/notifications/enqueue-template-channels"
          );
          await enqueueTemplateEmailSmsChannels(
            {
              templateKey,
              recipients: waRecipients,
              bookingId: (variables as { booking_id?: string })?.booking_id ?? null,
              tenantId: options?.tenantId ?? null,
              title,
              body,
              emailSubject,
              emailBody,
              smsBody,
              whatsappContentSid: contentSid || null,
              whatsappContentVariables: contentVars,
              whatsappCategory: waCategory,
              whatsappBody: waBody,
              whatsappTemplateStatus: waStatus,
              data: { template_key: templateKey, ...variables },
              url: pushUrlFields.actionPath || undefined,
            },
            options?.supabaseClient,
          );
        }
      }
    }
  }

  const notificationPayload: Record<string, unknown> = {
    include_external_user_ids: userIds,
    channels: channelsToSend,
    headings: { en: title },
    contents: { en: body },
    data: { type: templateKey, template_key: templateKey, ...variables },
  };

  if (channelsToSend.includes("push")) {
    // Set default high-priority alerting parameters for iOS and Android.
    // NOTE: we deliberately do NOT set `content_available: true` here. That flag
    // turns the push into a silent/background content-available delivery on iOS,
    // which is why template events never surfaced a banner while the super-admin
    // broadcast (which omits the flag) did. Keep this a normal visible alert.
    notificationPayload.ios_sound = "default";
    notificationPayload.priority = 10;
    notificationPayload.ios_interruption_level = "time_sensitive";
  }

  // NOTE: email/SMS are intentionally NOT added to the OneSignal payload here.
  // Those channels are delivered via the durable Resend/Twilio queue above
  // (see "Option A" block) and have already been stripped from channelsToSend.
  if (templateUrlRelative) {
    applyPushUrlToPayload(notificationPayload, pushUrlFields);
  }
  if (templateImage) notificationPayload.big_picture = templateImage;
  if (resolved.onesignalTemplateId) {
    notificationPayload.template_id = resolved.onesignalTemplateId;
  }

  // Auto-create in-app bell rows for every template notification so the bell
  // badge and inbox populate regardless of whether OneSignal push is configured.
  // Skips purely transactional/auth flows that don't belong in the notification inbox.
  const SKIP_IN_APP_TEMPLATES = new Set([
    "email_verification",
    "password_reset",
    "otp_verification",
    "weather_alert",
    "safety_alert",
    "safety_check_in",
  ]);
  /** Resolves when the in-app row insert completes — awaited for single-recipient badge accuracy. */
  let inAppInsertPromise: Promise<unknown> | null = null;
  if (
    !SKIP_IN_APP_TEMPLATES.has(templateKey) &&
    !options?.skipInApp &&
    userIds.length > 0 &&
    (title || body)
  ) {
    // Pull well-known context IDs out of template variables
    const inAppData: Record<string, unknown> = { template_key: templateKey };
    const WELL_KNOWN_VARS = [
      "booking_id", "conversation_id", "order_id", "request_id", "offer_id",
      "review_id", "dispute_id", "payment_id", "ticket_id", "campaign_id",
      "booking_number", "provider_name", "customer_name",
      "provider_id", "provider_slug", "group_booking_id",
      "charge_id", "additional_charge_id",
    ];
    WELL_KNOWN_VARS.forEach((k) => {
      const v = variables[k];
      if (v !== undefined && v !== null && String(v).length > 0) {
        inAppData[k] = v;
      }
    });

    let actionUrl: string | undefined;
    if (templateUrlRelative) {
      actionUrl = templateUrlRelative;
    }

    // Capture the insert promise so single-recipient sends can await it before
    // reading the unread count for an exact badge; multi-recipient sends still
    // treat it as fire-and-forget (never block a fan-out on DB insert latency).
    inAppInsertPromise = import("@/lib/notifications/insert-notification").then(({ insertNotifications }) =>
      insertNotifications(
        userIds.map((userId) => ({
          user_id: userId,
          type: templateKey,
          title: title || templateKey,
          message: body || title || "",
          data: inAppData,
          action_url: actionUrl,
        }))
      )
    );
    if (userIds.length > 1) void inAppInsertPromise;
  }

  // Always target devices (player_ids + correct app config) when we have userIds.
  // Use admin for user_devices reads — webhooks and provider routes have no customer JWT for RLS.
  if (userIds.length > 0) {
    const supabase = options?.supabaseClient ?? getSupabaseAdmin();
    let query = supabase
      .from("user_devices")
      .select("onesignal_player_id")
      .in("user_id", userIds);
    if (options?.appType === "provider") {
      query = query.eq("app_type", "provider");
    } else if (options?.appType === "customer") {
      query = query.or("app_type.eq.customer,app_type.is.null");
    }
    const { data: devices } = await query;
    const playerIds =
      (devices as { onesignal_player_id?: string | null }[] | null)
        ?.map((d) => d.onesignal_player_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0) ?? [];
    if (playerIds.length > 0 && channelsToSend.includes("push")) {
      notificationPayload.include_player_ids = playerIds;
    }
  }

  // §Badge-accuracy: set the OS app-icon badge so it is correct even when the
  // app is killed. For a single recipient, wait for the in-app row insert so
  // the unread count includes this notification, then set it exactly (SetTo).
  // Multi-recipient fan-outs increment by 1 (one payload carries one value).
  if (channelsToSend.includes("push")) {
    if (userIds.length === 1) {
      try {
        if (inAppInsertPromise) await inAppInsertPromise;
      } catch {
        // best-effort; still send a badge below
      }
      const unread = await getTotalUnreadBadgeCount(userIds[0], options?.appType ?? "customer");
      notificationPayload.ios_badgeType = "SetTo";
      notificationPayload.ios_badgeCount = exactIosBadgeCount(unread);
    } else if (userIds.length > 1) {
      notificationPayload.ios_badgeType = "Increase";
      notificationPayload.ios_badgeCount = 1;
    }
  }

  if (channelsToSend.length === 0) {
    return {
      success: true,
      notification_id: emailSmsEnqueued ? "queued-email-sms" : undefined,
      message: emailSmsEnqueued
        ? "Email/SMS enqueued for durable delivery; no push channel for recipients"
        : "No external channels enabled for recipients (preferences)",
    };
  }

  const directResult = await sendOneSignalNotification(notificationPayload, options);

  if (!directResult.success && isMustDeliverPushTemplate(templateKey)) {
    console.warn("[onesignal] must-deliver template send failed", {
      templateKey,
      error: directResult.error,
      userIds,
      usedFallback: resolved.usedFallback,
      appType: options?.appType,
    });
  }

  if (!directResult.success && userIds.length > 0 && isMustDeliverPushTemplate(templateKey)) {
    const bookingId = (variables as { booking_id?: string })?.booking_id ?? null;
    await enqueueMustDeliverChannelsRetry({
      templateKey,
      userIds,
      channels: channelsToSend,
      bookingId,
      tenantId: options?.tenantId ?? null,
      pushAppType: options?.appType ?? null,
      title,
      body,
      emailSubject,
      emailBody,
      smsBody,
      data: { template_key: templateKey, ...variables },
      url: pushUrlFields.actionPath || undefined,
      dedupePrefix: "fallback",
    });
  }

  return directResult;
}

// Wave 3.2: must-deliver templates fan into notification_delivery_queue on failure.
// Marketing/promotional templates are excluded — see must-deliver-push.ts.
export { isMustDeliverPushTemplate, isMarketingPushTemplate } from "@/lib/notifications/must-deliver-push";

/** @deprecated Use isMustDeliverPushTemplate(templateKey) instead. */
export const CRITICAL_TRANSACTIONAL_TEMPLATES = {
  has(key: string) {
    return isMustDeliverPushTemplate(key);
  },
} as Pick<Set<string>, "has">;

async function enqueueMustDeliverChannelsRetry(ctx: {
  templateKey: string;
  userIds: string[];
  channels: NotificationChannel[];
  bookingId: string | null;
  tenantId: string | null | undefined;
  pushAppType: OneSignalAppType | null | undefined;
  title: string;
  body: string;
  emailSubject: string;
  emailBody: string;
  smsBody: string;
  data: Record<string, unknown>;
  url?: string;
  dedupePrefix: string;
}): Promise<void> {
  try {
    const { enqueueNotification } = await import("@/lib/notifications/enqueue");
    await Promise.all(
      ctx.userIds.flatMap((userId) =>
        ctx.channels
          .filter((ch): ch is "email" | "sms" | "push" =>
            ch === "email" || ch === "sms" || ch === "push",
          )
          .map((channel) =>
            enqueueNotification({
              channel,
              templateKey: ctx.templateKey,
              recipientUserId: userId,
              bookingId: ctx.bookingId,
              tenantId: ctx.tenantId ?? null,
              pushAppType: channel === "push" ? (ctx.pushAppType ?? null) : null,
              payload: buildQueuePayload(channel, {
                title: ctx.title,
                body: ctx.body,
                emailSubject: ctx.emailSubject,
                emailBody: ctx.emailBody,
                smsBody: ctx.smsBody,
                data: ctx.data,
                url: ctx.url,
              }),
              dedupeKey: `${ctx.dedupePrefix}:${ctx.templateKey}:${userId}:${channel}:${ctx.bookingId ?? "none"}`,
            }),
          ),
      ),
    );
  } catch (enqueueErr) {
    console.error("[notifications] failed to enqueue durable retry", enqueueErr);
  }
}

function buildQueuePayload(
  channel: "email" | "sms" | "push",
  ctx: {
    title: string;
    body: string;
    emailSubject: string;
    emailBody: string;
    smsBody: string;
    data: Record<string, unknown>;
    url?: string;
  },
): Record<string, unknown> {
  if (channel === "email") {
    return {
      subject: ctx.emailSubject || ctx.title,
      html: ctx.emailBody || ctx.body,
      body: ctx.emailBody || ctx.body,
      data: ctx.data,
    };
  }
  if (channel === "sms") {
    return {
      body: ctx.smsBody || ctx.body,
      data: ctx.data,
    };
  }
  // push
  return {
    title: ctx.title,
    message: ctx.body,
    url: ctx.url,
    data: ctx.data,
  };
}
