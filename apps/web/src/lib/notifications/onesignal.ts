/**
 * OneSignal Notification Utilities
 * 
 * Server-side utilities for sending notifications via OneSignal REST API
 * Following official documentation: https://documentation.onesignal.com/reference/rest-api-overview
 */

import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { z } from "zod";
import { getOneSignalRestApiKey } from "@/lib/platform/secrets";

const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID;

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
  
  if (!ONESIGNAL_APP_ID) {
    missing.push("ONESIGNAL_APP_ID");
  }
  
  const restKey = await getOneSignalRestApiKey();
  if (!restKey) {
    missing.push("ONESIGNAL_REST_API_KEY");
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
 * Register a device for push notifications
 */
export async function registerDevice(
  userId: string,
  playerId: string,
  platform: "web" | "ios" | "android"
): Promise<{ success: boolean; error?: string }> {
  const supabase = await getSupabaseServer();
  
  const { error } = await supabase
    .from("user_devices")
    .upsert(
      {
        user_id: userId,
        onesignal_player_id: playerId,
        platform,
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

/**
 * Send notification via OneSignal REST API
 * Supports: Push, Email, SMS, Live Activities
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
  }
): Promise<SendNotificationResult> {
  const restKey = await getOneSignalRestApiKey();
  if (!ONESIGNAL_APP_ID || !restKey) {
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
    app_id: ONESIGNAL_APP_ID,
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
 * Send notification to a single user
 */
export async function sendToUser(
  userId: string,
  payload: NotificationPayload,
  channels: NotificationChannel[] = ["push"]
): Promise<SendNotificationResult> {
  const supabase = await getSupabaseServer();

  // Get user's devices
  const { data: devices } = await supabase
    .from("user_devices")
    .select("onesignal_player_id")
    .eq("user_id", userId);

  const playerIds = devices?.map((d: any) => d.onesignal_player_id) || [];

  // Build notification payload
  const notificationPayload: any = {
    include_external_user_ids: [userId], // Use external user ID for cross-channel targeting
    channels,
    headings: { en: payload.title },
    contents: { en: payload.message },
    data: payload.data || {},
  };

  // Add channel-specific content
  if (channels.includes("email")) {
    notificationPayload.email_subject = payload.title;
    notificationPayload.email_body = payload.message;
  }

  if (channels.includes("sms")) {
    notificationPayload.sms_body = payload.message;
  }

  if (payload.url) {
    notificationPayload.url = payload.url;
  }

  if (payload.image) {
    notificationPayload.big_picture = payload.image;
  }

  // If we have player IDs, also include them for push
  if (playerIds.length > 0 && channels.includes("push")) {
    notificationPayload.include_player_ids = playerIds;
  }

  return await sendOneSignalNotification(notificationPayload);
}

/**
 * Send notification to multiple users
 */
export async function sendToUsers(
  userIds: string[],
  payload: NotificationPayload,
  channels: NotificationChannel[] = ["push"]
): Promise<SendNotificationResult> {
  const supabase = await getSupabaseServer();

  // Get all devices for these users
  const { data: devices } = await supabase
    .from("user_devices")
    .select("onesignal_player_id, user_id")
    .in("user_id", userIds);

  const playerIds = devices?.map((d: any) => d.onesignal_player_id) || [];

  // Build notification payload
  const notificationPayload: any = {
    include_external_user_ids: userIds,
    channels,
    headings: { en: payload.title },
    contents: { en: payload.message },
    data: payload.data || {},
  };

  // Add channel-specific content
  if (channels.includes("email")) {
    notificationPayload.email_subject = payload.title;
    notificationPayload.email_body = payload.message;
  }

  if (channels.includes("sms")) {
    notificationPayload.sms_body = payload.message;
  }

  if (payload.url) {
    notificationPayload.url = payload.url;
  }

  if (payload.image) {
    notificationPayload.big_picture = payload.image;
  }

  // If we have player IDs, also include them for push
  if (playerIds.length > 0 && channels.includes("push")) {
    notificationPayload.include_player_ids = playerIds;
  }

  return await sendOneSignalNotification(notificationPayload);
}

/**
 * Send notification to a segment (using OneSignal filters)
 */
export async function sendToSegment(
  segmentQuery: Record<string, any>,
  payload: NotificationPayload,
  channels: NotificationChannel[] = ["push"]
): Promise<SendNotificationResult> {
  // Convert segment query to OneSignal filters
  const filters = Object.entries(segmentQuery).map(([key, value]) => ({
    field: key,
    relation: "=",
    value,
  }));

  // Build notification payload
  const notificationPayload: any = {
    filters,
    channels,
    headings: { en: payload.title },
    contents: { en: payload.message },
    data: payload.data || {},
  };

  // Add channel-specific content
  if (channels.includes("email")) {
    notificationPayload.email_subject = payload.title;
    notificationPayload.email_body = payload.message;
  }

  if (channels.includes("sms")) {
    notificationPayload.sms_body = payload.message;
  }

  if (payload.url) {
    notificationPayload.url = payload.url;
  }

  if (payload.image) {
    notificationPayload.big_picture = payload.image;
  }

  return await sendOneSignalNotification(notificationPayload);
}

/**
 * Get notification template by key
 */
export async function getNotificationTemplate(key: string): Promise<any> {
  const supabase = await getSupabaseServer();

  const { data: template } = await supabase
    .from("notification_templates")
    .select("*")
    .eq("key", key)
    .eq("enabled", true)
    .single();

  return template;
}

/**
 * Send notification using a template
 */
export async function sendTemplateNotification(
  templateKey: string,
  userIds: string[],
  variables: Record<string, string> = {},
  channels: NotificationChannel[] = ["push"]
): Promise<SendNotificationResult> {
  const template = await getNotificationTemplate(templateKey);

  if (!template) {
    return {
      success: false,
      error: `Template ${templateKey} not found or disabled`,
    };
  }

  // Replace variables in title and body
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

  // Use template channels if specified, otherwise use provided channels
  const activeChannels = template.channels && template.channels.length > 0
    ? template.channels.filter((ch: string) => channels.includes(ch as NotificationChannel))
    : channels;

  // Build notification payload
  const notificationPayload: any = {
    include_external_user_ids: userIds,
    channels: activeChannels,
    headings: { en: title },
    contents: { en: body },
    data: {
      template_key: templateKey,
      ...variables,
    },
  };

  // Add channel-specific content from template
  if (activeChannels.includes("email")) {
    notificationPayload.email_subject = emailSubject;
    notificationPayload.email_body = emailBody;
  }

  if (activeChannels.includes("sms")) {
    notificationPayload.sms_body = smsBody;
  }

  if (template.url) {
    notificationPayload.url = template.url;
  }

  if (template.image) {
    notificationPayload.big_picture = template.image;
  }

  // Use OneSignal template if configured
  if (template.onesignal_template_id) {
    notificationPayload.template_id = template.onesignal_template_id;
  }

  return await sendOneSignalNotification(notificationPayload);
}
