import type { SupabaseClient } from "@supabase/supabase-js";
import {
  channelAllowedForCustomerUser,
  resolveChannelsPerCustomerRecipient,
  templateKeyToPreferenceSection,
  type NotificationChannelName,
} from "@/lib/notifications/customer-notification-channels";
import {
  providerTemplateKeyToPreferenceSection,
  resolveChannelsPerProviderRecipient,
} from "@/lib/notifications/provider-notification-channels";
import type { OneSignalAppType } from "@/lib/platform/secrets";

export type PrefGatedAppType = "customer" | "provider";

export function resolveTemplateKeyFromPayload(
  data: Record<string, unknown> | null | undefined,
  fallbackType?: string | null,
): string | null {
  const fromData = data?.template_key;
  if (typeof fromData === "string" && fromData.trim()) return fromData.trim();
  const fromType = data?.type;
  if (typeof fromType === "string" && fromType.trim()) return fromType.trim();
  if (typeof fallbackType === "string" && fallbackType.trim()) return fallbackType.trim();
  return null;
}

/**
 * Filter requested channels for one user using notification_preferences.
 */
export async function filterChannelsForRecipient(
  supabase: SupabaseClient,
  userId: string,
  templateKey: string,
  requested: NotificationChannelName[],
  appType: PrefGatedAppType,
): Promise<NotificationChannelName[]> {
  if (!userId || requested.length === 0) return [];
  if (appType === "customer") {
    const map = await resolveChannelsPerCustomerRecipient(supabase, [userId], templateKey, requested);
    return map.get(userId) ?? [];
  }
  const map = await resolveChannelsPerProviderRecipient(supabase, [userId], templateKey, requested);
  return map.get(userId) ?? [];
}

export async function filterChannelsForRecipients(
  supabase: SupabaseClient,
  userIds: string[],
  templateKey: string,
  requested: NotificationChannelName[],
  appType: PrefGatedAppType,
): Promise<Map<string, NotificationChannelName[]>> {
  if (appType === "customer") {
    return resolveChannelsPerCustomerRecipient(supabase, userIds, templateKey, requested);
  }
  return resolveChannelsPerProviderRecipient(supabase, userIds, templateKey, requested);
}

/** Map payload type to template key when possible (direct sendToUser paths). */
export function templateKeyForDirectSend(
  appType: OneSignalAppType | undefined,
  payloadType: string | undefined,
  data: Record<string, unknown> | undefined,
): string | null {
  const fromData = resolveTemplateKeyFromPayload(data ?? null, payloadType);
  if (fromData) return fromData;
  if (!payloadType) return null;
  const t = payloadType.toLowerCase();
  if (t === "new_message") return appType === "provider" ? "provider_new_message" : "customer_new_message";
  if (t === "group_booking_cancellation") return "booking_cancelled";
  if (t === "test_notification") return "test_notification";
  return payloadType;
}

export { templateKeyToPreferenceSection, providerTemplateKeyToPreferenceSection, channelAllowedForCustomerUser };
