/**
 * OneSignal Notification Utilities
 * 
 * Server-side utilities for sending notifications via OneSignal REST API
 * Following official documentation: https://documentation.onesignal.com/reference/rest-api-overview
 */

import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { z } from "zod";
import { resolveOneSignalCredentials, type OneSignalAppType } from "@/lib/platform/secrets";

// OneSignal API base URL
const ONESIGNAL_API_BASE = "https://api.onesignal.com";

/**
 * Notification channels supported by OneSignal
 */
export type NotificationChannel = "push" | "email" | "sms" | "live_activities";

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
  data: z.record(z.string(), z.any()).optional(),
}).passthrough();

export type NotificationPayload = z.infer<typeof NotificationPayloadSchema>;

export interface SendNotificationResult {
  success: boolean;
  data?: any;
  error?: string;
  message?: string;
  notification_id?: string;
}

export interface NotificationLogEntry {
  event_type: string;
  recipients: string[]; // user_ids or player_ids
  payload: any;
  status: "sent" | "failed" | "pending";
  provider_response: any;
  error_message?: string;
  channels?: NotificationChannel[];
}

/**
 * Verify OneSignal configuration
 */
export async function verifyOneSignalConfig(): Promise<{
  configured: boolean;
  missing: string[];
}> {
  const missing: string[] = [];
  const legacy = await resolveOneSignalCredentials(undefined);
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
  let supabase: any;
  try {
    supabase = getSupabaseAdmin();
  } catch {
    supabase = await getSupabaseServer();
  }

  const { error } = await supabase.from("notification_logs").insert({
    event_type: entry.event_type,
    recipients: entry.recipients,
    payload: entry.payload,
    status: entry.status,
    provider_response: entry.provider_response,
    error_message: entry.error_message,
    channels: entry.channels || ["push"],
    created_at: new Date().toISOString(),
  });
  
  if (error) {
    console.error("Error logging notification:", error);
  }
}

/**
 * Register a device for push notifications.
 * @param appType - 'customer' | 'provider' for multi-app OneSignal; defaults to 'customer'.
 */
export async function registerDevice(
  userId: string,
  playerId: string,
  platform: "web" | "ios" | "android",
  appType: OneSignalAppType = "customer"
): Promise<{ success: boolean; error?: string }> {
  const supabase = await getSupabaseServer();

  const { error } = await supabase
    .from("user_devices")
    .upsert(
      {
        user_id: userId,
        onesignal_player_id: playerId,
        platform,
        app_type: appType,
        last_seen: new Date().toISOString(),
      },
      { onConflict: "onesignal_player_id" }
    );

  if (error) {
    console.error("Error registering device:", error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

/** Options for which OneSignal app to use (multi-app support). */
export type OneSignalSendOptions = {
  appType?: OneSignalAppType;
  /** When sending to users who are not the current requester (e.g. provider when customer creates request), pass admin client so device lookup is not blocked by RLS. */
  supabaseClient?: any;
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
    filters?: any[];
    channels?: NotificationChannel[];
    headings?: Record<string, string>;
    contents?: Record<string, string>;
    subtitle?: Record<string, string>;
    data?: Record<string, any>;
    url?: string;
    big_picture?: string;
    email_subject?: string;
    email_body?: string;
    sms_from?: string;
    sms_body?: string;
    live_activities?: any;
    template_id?: string;
    content_available?: boolean;
    mutable_content?: boolean;
    priority?: number;
    ios_sound?: string;
    android_channel_id?: string;
    ios_interruption_level?: "passive" | "active" | "time_sensitive" | "critical";
  },
  options?: OneSignalSendOptions
): Promise<SendNotificationResult> {
  const appType = options?.appType;
  const resolved = await resolveOneSignalCredentials(appType);
  const appId = resolved.appId;
  const restKey = resolved.restKey;
  if (!appId || !restKey) {
    console.warn("OneSignal API keys not configured. Skipping notification send.");
    await logNotification({
      event_type: payload.data?.type || "notification",
      recipients: payload.include_player_ids || payload.include_external_user_ids || [],
      payload,
      status: "failed",
      provider_response: { message: "OneSignal API keys not configured" },
      error_message: "OneSignal API keys not configured",
      channels: payload.channels || ["push"],
    });
    return { success: false, message: "OneSignal API keys not configured" };
  }

  // Build OneSignal notification payload
  // According to: https://documentation.onesignal.com/reference/create-notification
  const notification: any = {
    app_id: appId,
  };

  // Targeting
  if (payload.include_player_ids && payload.include_player_ids.length > 0) {
    notification.include_player_ids = payload.include_player_ids;
  }
  if (payload.include_external_user_ids && payload.include_external_user_ids.length > 0) {
    notification.include_external_user_ids = payload.include_external_user_ids;
  }
  if (payload.filters && payload.filters.length > 0) {
    notification.filters = payload.filters;
  }

  // Channels - specify which channels to send to
  if (payload.channels && payload.channels.length > 0) {
    notification.channel_for_external_user_ids = payload.channels;
  }

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
  if (payload.android_channel_id) {
    notification.android_channel_id = payload.android_channel_id;
  }
  if (payload.ios_interruption_level) {
    notification.ios_interruption_level = payload.ios_interruption_level;
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

  // Template ID (if using OneSignal templates)
  if (payload.template_id) {
    notification.template_id = payload.template_id;
  }

  try {
    const response = await fetch(`${ONESIGNAL_API_BASE}/notifications`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      Authorization: `Basic ${restKey}`,
      },
      body: JSON.stringify(notification),
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error("OneSignal API error:", responseData);
      await logNotification({
        event_type: payload.data?.type || "notification",
        recipients: payload.include_player_ids || payload.include_external_user_ids || [],
        payload,
        status: "failed",
        provider_response: responseData,
        error_message: responseData.errors?.join(", ") || "Unknown OneSignal error",
        channels: payload.channels || ["push"],
      });
      return {
        success: false,
        error: responseData.errors?.join(", ") || "Unknown error",
      };
    }

    await logNotification({
      event_type: payload.data?.type || "notification",
      recipients: payload.include_player_ids || payload.include_external_user_ids || [],
      payload,
      status: "sent",
      provider_response: responseData,
      channels: payload.channels || ["push"],
    });

    return {
      success: true,
      data: responseData,
      notification_id: responseData.id,
    };
  } catch (error) {
    console.error("Error sending OneSignal notification:", error);
    await logNotification({
      event_type: payload.data?.type || "notification",
      recipients: payload.include_player_ids || payload.include_external_user_ids || [],
      payload,
      status: "failed",
      provider_response: { message: error instanceof Error ? error.message : "Unknown error" },
      error_message: error instanceof Error ? error.message : "Unknown error",
      channels: payload.channels || ["push"],
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
  channels: NotificationChannel[] = ["push"],
  options?: OneSignalSendOptions
): Promise<SendNotificationResult> {
  // When sending to provider, device lookup often runs in customer/webhook context; use admin so RLS does not block.
  const supabase =
    options?.supabaseClient ??
    (await (options?.appType === "provider"
      ? Promise.resolve(getSupabaseAdmin())
      : getSupabaseServer()));

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
  const playerIds = devices?.map((d: any) => d.onesignal_player_id) || [];

  const notificationPayload: any = {
    include_external_user_ids: [userId],
    channels,
    headings: { en: payload.title },
    contents: { en: payload.message },
    data: payload.data || {},
  };

  if (channels.includes("email")) {
    notificationPayload.email_subject = payload.title;
    notificationPayload.email_body = payload.message;
  }
  if (channels.includes("sms")) {
    notificationPayload.sms_body = payload.message;
  }
  if (payload.url) notificationPayload.url = payload.url;
  if (payload.image) notificationPayload.big_picture = payload.image;
  if (playerIds.length > 0 && channels.includes("push")) {
    notificationPayload.include_player_ids = playerIds;
  }
  const passthrough = payload as Record<string, unknown>;
  if (passthrough.priority !== undefined) notificationPayload.priority = passthrough.priority;
  if (passthrough.ios_sound) notificationPayload.ios_sound = passthrough.ios_sound;
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
  channels: NotificationChannel[] = ["push"],
  options?: OneSignalSendOptions
): Promise<SendNotificationResult> {
  const supabase = options?.supabaseClient ?? (await getSupabaseServer());

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
  const playerIds = devices?.map((d: any) => d.onesignal_player_id) || [];

  const notificationPayload: any = {
    include_external_user_ids: userIds,
    channels,
    headings: { en: payload.title },
    contents: { en: payload.message },
    data: payload.data || {},
  };

  if (channels.includes("email")) {
    notificationPayload.email_subject = payload.title;
    notificationPayload.email_body = payload.message;
  }
  if (channels.includes("sms")) {
    notificationPayload.sms_body = payload.message;
  }
  if (payload.url) notificationPayload.url = payload.url;
  if (payload.image) notificationPayload.big_picture = payload.image;
  if (playerIds.length > 0 && channels.includes("push")) {
    notificationPayload.include_player_ids = playerIds;
  }
  const passthrough = payload as Record<string, unknown>;
  if (passthrough.priority !== undefined) notificationPayload.priority = passthrough.priority;
  if (passthrough.ios_sound) notificationPayload.ios_sound = passthrough.ios_sound;
  if (passthrough.android_channel_id) notificationPayload.android_channel_id = passthrough.android_channel_id;
  if (passthrough.ios_interruption_level) notificationPayload.ios_interruption_level = passthrough.ios_interruption_level;

  return await sendOneSignalNotification(notificationPayload, options);
}

/**
 * Send notification to a segment (using OneSignal filters).
 * @param options.appType - Which OneSignal app to use when using two apps.
 */
export async function sendToSegment(
  segmentQuery: Record<string, any>,
  payload: NotificationPayload,
  channels: NotificationChannel[] = ["push"],
  options?: OneSignalSendOptions
): Promise<SendNotificationResult> {
  const filters = Object.entries(segmentQuery).map(([key, value]) => ({
    field: key,
    relation: "=",
    value,
  }));

  const notificationPayload: any = {
    filters,
    channels,
    headings: { en: payload.title },
    contents: { en: payload.message },
    data: payload.data || {},
  };

  if (channels.includes("email")) {
    notificationPayload.email_subject = payload.title;
    notificationPayload.email_body = payload.message;
  }
  if (channels.includes("sms")) {
    notificationPayload.sms_body = payload.message;
  }
  if (payload.url) notificationPayload.url = payload.url;
  if (payload.image) notificationPayload.big_picture = payload.image;

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
export async function getNotificationTemplate(
  key: string,
  supabaseClient?: any,
  tenantId?: string | null
): Promise<any> {
  const supabase = supabaseClient ?? (await getSupabaseServer());

  // 1. If tenantId provided, try tenant-specific template first
  if (tenantId) {
    const { data: tenantTemplate } = await supabase
      .from("notification_templates")
      .select("*")
      .eq("key", key)
      .eq("tenant_id", tenantId)
      .eq("enabled", true)
      .maybeSingle();

    if (tenantTemplate) return tenantTemplate;
  }

  // 2. Fall back to global template (tenant_id IS NULL)
  const { data: globalTemplate } = await supabase
    .from("notification_templates")
    .select("*")
    .eq("key", key)
    .is("tenant_id", null)
    .eq("enabled", true)
    .maybeSingle();

  return globalTemplate ?? null;
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
  channels: NotificationChannel[] = ["push"],
  options?: SendTemplateOptions
): Promise<SendNotificationResult> {
  const templateClient =
    options?.supabaseClient ??
    (options?.appType === "provider" ? getSupabaseAdmin() : undefined);
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

  const activeChannels =
    template.channels && template.channels.length > 0
      ? template.channels.filter((ch: string) =>
          channels.includes(ch as NotificationChannel)
        )
      : channels;

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

  const notificationPayload: any = {
    include_external_user_ids: userIds,
    channels: channelsToSend,
    headings: { en: title },
    contents: { en: body },
    data: { template_key: templateKey, ...variables },
  };

  if (channelsToSend.includes("email")) {
    notificationPayload.email_subject = emailSubject;
    notificationPayload.email_body = emailBody;
  }
  if (channelsToSend.includes("sms")) {
    notificationPayload.sms_body = smsBody;
  }
  if (templateUrl) notificationPayload.url = templateUrl;
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
      "booking_id", "conversation_id", "order_id", "request_id",
      "review_id", "dispute_id", "payment_id", "ticket_id", "campaign_id",
      "booking_number", "provider_name", "customer_name",
    ];
    WELL_KNOWN_VARS.forEach((k) => {
      if (variables[k]) inAppData[k] = variables[k];
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

  // When appType is set, target only devices for that app (player_ids + correct app config).
  // When sending to provider, use admin client so device lookup works from customer/webhook context.
  if (options?.appType && userIds.length > 0) {
    const supabase =
      options?.supabaseClient ??
      (await (options.appType === "provider"
        ? Promise.resolve(getSupabaseAdmin())
        : getSupabaseServer()));
    let query = supabase
      .from("user_devices")
      .select("onesignal_player_id")
      .in("user_id", userIds);
    if (options.appType === "provider") {
      query = query.eq("app_type", "provider");
    } else {
      query = query.or("app_type.eq.customer,app_type.is.null");
    }
    const { data: devices } = await query;
    const playerIds = devices?.map((d: any) => d.onesignal_player_id) || [];
    if (playerIds.length > 0 && channelsToSend.includes("push")) {
      notificationPayload.include_player_ids = playerIds;
    }
  }

  if (channelsToSend.length === 0) {
    return { success: true, message: "No external channels enabled for recipients (preferences)" };
  }

  return await sendOneSignalNotification(notificationPayload, options);
}
