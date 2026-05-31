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
import { z } from "zod";
import {
  resolveOneSignalCredentials,
  type OneSignalAppType,
  type ResolveOneSignalOptions,
} from "@/lib/platform/secrets";

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

function eventTypeFromPayloadData(data: unknown): string {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const t = (data as { type?: unknown }).type;
    if (typeof t === "string" && t.trim()) return t;
  }
  return "notification";
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
};

/**
 * Send notification via OneSignal REST API
 * Supports: Push, Email, SMS, Live Activities
 * When options.appType is set, uses that app's config (customer/provider); otherwise legacy single-app.
 *
 * According to: https://documentation.onesignal.com/reference/create-notification
 */
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

  const appType = options?.appType;
  const resolved = await resolveOneSignalCredentials(appType, { tenantId: options?.tenantId });
  const appId = resolved.appId?.replace(/^\uFEFF/, "").trim() || null;
  const restKey = resolved.restKey?.replace(/^\uFEFF/, "").trim() || null;
  if (!appId || !restKey) {
    console.warn("OneSignal API keys not configured. Skipping notification send.");
    await logNotification({
      event_type: eventTypeFromPayloadData(payload.data),
      recipients: payload.include_player_ids || payload.include_external_user_ids || [],
      payload,
      status: "failed",
      provider_response: { message: "OneSignal API keys not configured" },
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
  if (payload.ios_interruption_level) {
    notification.ios_interruption_level = payload.ios_interruption_level;
  }
  if (payload.name && String(payload.name).trim()) {
    notification.name = String(payload.name).trim().slice(0, 128);
  }
  if (payload.send_after && String(payload.send_after).trim()) {
    notification.send_after = String(payload.send_after).trim();
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

    await logNotification({
      event_type: eventTypeFromPayloadData(payload.data),
      recipients: payload.include_player_ids || payload.include_external_user_ids || [],
      payload,
      status: "sent",
      provider_response: responseData,
      channels: parseNotificationChannels(payload.channels ?? null),
    });

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

  const notificationPayload: Record<string, unknown> = {
    include_external_user_ids: [userId],
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
    notificationPayload.url = payload.url;
    (notificationPayload.data as Record<string, unknown>).url = payload.url;
    (notificationPayload.data as Record<string, unknown>).deep_link = payload.url;
  }
  if (payload.image) notificationPayload.big_picture = payload.image;
  if (playerIds.length > 0 && normalizedChannels.includes("push")) {
    notificationPayload.include_player_ids = playerIds;
    notificationPayload.ios_interruption_level = "time_sensitive";
    notificationPayload.ios_badgeType = "Increase";
    notificationPayload.ios_badgeCount = 1;
  }
  const passthrough = payload as Record<string, unknown>;
  if (passthrough.priority !== undefined) notificationPayload.priority = passthrough.priority;
  if (passthrough.ios_sound) notificationPayload.ios_sound = passthrough.ios_sound;
  if (passthrough.ios_badgeType) notificationPayload.ios_badgeType = passthrough.ios_badgeType;
  if (typeof passthrough.ios_badgeCount === "number") notificationPayload.ios_badgeCount = passthrough.ios_badgeCount;
  if (passthrough.android_channel_id) notificationPayload.android_channel_id = passthrough.android_channel_id;
  if (passthrough.ios_interruption_level) notificationPayload.ios_interruption_level = passthrough.ios_interruption_level;

  return await sendOneSignalNotification(notificationPayload, options);
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
  const normalizedChannels = parseNotificationChannels(channels);
  const supabase = options?.supabaseClient ?? getSupabaseAdmin();

  let query = supabase
    .from("user_devices")
    .select("onesignal_player_id, user_id")
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

  const notificationPayload: Record<string, unknown> = {
    include_external_user_ids: userIds,
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
    notificationPayload.url = payload.url;
    (notificationPayload.data as Record<string, unknown>).url = payload.url;
    (notificationPayload.data as Record<string, unknown>).deep_link = payload.url;
  }
  if (payload.image) notificationPayload.big_picture = payload.image;
  if (playerIds.length > 0 && normalizedChannels.includes("push")) {
    notificationPayload.include_player_ids = playerIds;
    notificationPayload.ios_interruption_level = "time_sensitive";
    notificationPayload.ios_badgeType = "Increase";
    notificationPayload.ios_badgeCount = 1;
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
  const passthrough = payload as Record<string, unknown>;
  if (passthrough.priority !== undefined) notificationPayload.priority = passthrough.priority;
  if (passthrough.ios_sound) notificationPayload.ios_sound = passthrough.ios_sound;
  if (passthrough.ios_badgeType) notificationPayload.ios_badgeType = passthrough.ios_badgeType;
  if (typeof passthrough.ios_badgeCount === "number") notificationPayload.ios_badgeCount = passthrough.ios_badgeCount;
  if (passthrough.android_channel_id) notificationPayload.android_channel_id = passthrough.android_channel_id;
  if (passthrough.ios_interruption_level) notificationPayload.ios_interruption_level = passthrough.ios_interruption_level;

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
    notificationPayload.url = payload.url;
    (notificationPayload.data as Record<string, unknown>).url = payload.url;
    (notificationPayload.data as Record<string, unknown>).deep_link = payload.url;
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
  const requestedFilter = parseNotificationChannels(channels);
  const templateClient = options?.supabaseClient ?? getSupabaseAdmin();
  const template = await getNotificationTemplate(
    templateKey,
    templateClient,
    options?.tenantId
  );

  if (!template) {
    return {
      success: false,
      error: `Template ${templateKey} not found or disabled`,
    };
  }

  let title = template.title || "";
  let body = template.body || "";
  let emailSubject = template.email_subject || template.title || "";
  let emailBody = template.email_body || template.body || "";
  let smsBody = template.sms_body || template.body || "";

  Object.entries(variables).forEach(([key, value]) => {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    title = title.replace(regex, value);
    body = body.replace(regex, value);
    emailSubject = emailSubject.replace(regex, value);
    emailBody = emailBody.replace(regex, value);
    smsBody = smsBody.replace(regex, value);
  });

  let templateUrl = template.url ? String(template.url) : "";
  Object.entries(variables).forEach(([key, value]) => {
    templateUrl = templateUrl.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  });
  if (templateUrl.startsWith("/")) {
    const origin =
      typeof process.env.NEXT_PUBLIC_APP_URL === "string"
        ? process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")
        : "";
    if (origin) {
      templateUrl = `${origin}${templateUrl}`;
    }
  }

  let templateImage = template.image ? String(template.image) : "";
  Object.entries(variables).forEach(([key, value]) => {
    templateImage = templateImage.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  });

  const activeChannels: NotificationChannel[] =
    template.channels && template.channels.length > 0
      ? template.channels.filter((ch): ch is NotificationChannel => {
          const c = ch as NotificationChannel;
          return (
            (c === "push" || c === "email" || c === "sms" || c === "live_activities") &&
            requestedFilter.includes(c)
          );
        })
      : requestedFilter;

  // Track what was originally requested so we can observe (and log) any push
  // that gets silently dropped by preference gating or quiet hours below.
  const pushRequested = activeChannels.includes("push");
  let quietHoursSuppressedPush = false;

  let channelsToSend: NotificationChannel[] = [...activeChannels];
  if (options?.appType === "customer" && userIds.length > 0) {
    const { intersectChannelsForCustomerRecipients } = await import(
      "@/lib/notifications/customer-notification-channels"
    );
    const nonPref = channelsToSend.filter((c) => c !== "email" && c !== "sms" && c !== "push");
    const triad = channelsToSend.filter((c): c is "email" | "sms" | "push" =>
      c === "email" || c === "sms" || c === "push"
    );
    const allowed = await intersectChannelsForCustomerRecipients(
      getSupabaseAdmin(),
      userIds,
      templateKey,
      triad
    );
    channelsToSend = [...nonPref, ...allowed];
  }

  // Quiet hours enforcement: suppress push notifications during quiet hours,
  // but never suppress critical transactional templates.
  if (
    channelsToSend.includes("push") &&
    userIds.length > 0 &&
    !CRITICAL_TRANSACTIONAL_TEMPLATES.has(templateKey)
  ) {
    try {
      const supabaseAdmin = getSupabaseAdmin();
      const { data: profiles } = await supabaseAdmin
        .from("user_profiles")
        .select("user_id, notification_preferences")
        .in("user_id", userIds);

      if (profiles && profiles.length > 0) {
        const now = new Date();
        const nowHHMM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
        const allInQuietHours = profiles.every((p) => {
          const prefs = p.notification_preferences as Record<string, unknown> | null;
          if (!prefs?.quiet_hours_enabled) return false;
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

  if (channelsToSend.length === 0) {
    return {
      success: true,
      notification_id: quietHoursSuppressedPush ? "suppressed-quiet-hours" : "suppressed-preferences",
      message: quietHoursSuppressedPush
        ? "Push suppressed: all recipients in quiet hours"
        : "No external channels enabled for recipients (preferences)",
    };
  }

  const notificationPayload: Record<string, unknown> = {
    include_external_user_ids: userIds,
    channels: channelsToSend,
    headings: { en: title },
    contents: { en: body },
    data: { template_key: templateKey, ...variables },
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

  if (channelsToSend.includes("email")) {
    notificationPayload.email_subject = emailSubject;
    notificationPayload.email_body = emailBody;
  }
  if (channelsToSend.includes("sms")) {
    notificationPayload.sms_body = smsBody;
  }
  if (templateUrl) {
    notificationPayload.url = templateUrl;
    (notificationPayload.data as Record<string, unknown>).url = templateUrl;
    (notificationPayload.data as Record<string, unknown>).deep_link = templateUrl;
  }
  if (templateImage) notificationPayload.big_picture = templateImage;
  if (template.onesignal_template_id) {
    notificationPayload.template_id = template.onesignal_template_id;
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
  if (!SKIP_IN_APP_TEMPLATES.has(templateKey) && userIds.length > 0 && (title || body)) {
    // Pull well-known context IDs out of template variables
    const inAppData: Record<string, unknown> = { template_key: templateKey };
    const WELL_KNOWN_VARS = [
      "booking_id", "conversation_id", "order_id", "request_id", "offer_id",
      "review_id", "dispute_id", "payment_id", "ticket_id", "campaign_id",
      "booking_number", "provider_name", "customer_name",
    ];
    WELL_KNOWN_VARS.forEach((k) => {
      const v = variables[k];
      if (v !== undefined && v !== null && String(v).length > 0) {
        inAppData[k] = v;
      }
    });

    // Derive a clean action_url from the resolved template URL
    let actionUrl: string | undefined;
    if (templateUrl) {
      try {
        actionUrl = templateUrl.startsWith("/")
          ? templateUrl
          : new URL(templateUrl).pathname;
      } catch {
        actionUrl = templateUrl;
      }
    }

    // Fire-and-forget: never block the push send on DB insert latency
    void import("@/lib/notifications/insert-notification").then(({ insertNotifications }) =>
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

  if (channelsToSend.length === 0) {
    return { success: true, message: "No external channels enabled for recipients (preferences)" };
  }

  const directResult = await sendOneSignalNotification(notificationPayload, options);

  // Wave 3.2 (audit 2026-04 final 100/100): durable retry safety net.
  // For critical transactional and reminder templates, if the direct
  // send did NOT succeed we enqueue a durable row per (user × channel)
  // so the notification-queue cron will retry with exponential backoff
  // and eventually DLQ on permanent failure. Silent drops of these
  // templates previously cost us customers; the queue cron is the
  // single place that guarantees eventual delivery.
  //
  // Non-critical templates (marketing, promotions, broad fan-outs) do
  // not fan into the queue — the failure cost there is low and the
  // queue volume is high.
  if (
    !directResult.success &&
    userIds.length > 0 &&
    CRITICAL_TRANSACTIONAL_TEMPLATES.has(templateKey)
  ) {
    try {
      const { enqueueNotification } = await import("@/lib/notifications/enqueue");
      const bookingId =
        (variables as { booking_id?: string })?.booking_id ?? null;
      await Promise.all(
        userIds.flatMap((userId) =>
          channelsToSend
            .filter((ch): ch is "email" | "sms" | "push" =>
              ch === "email" || ch === "sms" || ch === "push",
            )
            .map((channel) =>
              enqueueNotification({
                channel,
                templateKey,
                recipientUserId: userId,
                bookingId,
                tenantId: options?.tenantId ?? null,
                pushAppType:
                  channel === "push" ? (options?.appType ?? null) : null,
                payload: buildQueuePayload(channel, {
                  title,
                  body,
                  emailSubject,
                  emailBody,
                  smsBody,
                  data: { template_key: templateKey, ...variables },
                  url: templateUrl || undefined,
                }),
                dedupeKey: `fallback:${templateKey}:${userId}:${channel}:${bookingId ?? "none"}`,
              }),
            ),
        ),
      );
    } catch (enqueueErr) {
      // Never let a retry-queue write break the original response.
      console.error(
        "[sendTemplateNotification] failed to enqueue durable retry",
        enqueueErr,
      );
    }
  }

  return directResult;
}

// Wave 3.2: templates that MUST eventually reach the recipient. On direct
// send failure we fan-out into notification_delivery_queue for retry.
const CRITICAL_TRANSACTIONAL_TEMPLATES = new Set<string>([
  // Booking lifecycle (customer + provider)
  "booking_confirmed",
  "booking_cancelled",
  "booking_cancelled_by_customer",
  "booking_cancelled_by_provider",
  "booking_cancelled_emergency",
  "booking_rescheduled",
  "booking_time_changed",
  "booking_date_changed",
  "provider_booking_request",
  "provider_booking_cancelled",
  "provider_booking_rescheduled",
  "provider_booking_time_changed",
  "provider_booking_date_changed",
  // Reminders
  "appointment_reminder",
  "booking_reminder_24h",
  "booking_reminder_2h",
  // Payments + refunds
  "payment_successful",
  "payment_failed",
  "payment_pending",
  "payment_method_expired",
  "partial_payment_received",
  "additional_charge_requested",
  "refund_processed",
  "invoice_generated",
  "receipt_sent",
  // Provider payouts
  "provider_payout_processed",
  "provider_payout_scheduled",
  "provider_payout_failed",
  // Abandoned booking re-engagement
  "abandoned_booking_reminder",
  // Security/critical user flows
  "password_reset",
  "email_verification",
  "otp_verification",
  // Conversations (customer ↔ provider)
  "customer_new_message",
  "provider_new_message",
]);

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
