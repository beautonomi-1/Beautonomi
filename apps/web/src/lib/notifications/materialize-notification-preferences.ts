import type { SupabaseClient } from "@supabase/supabase-js";
import { computeUserNotificationRollup } from "@/lib/notifications/customer-notification-channels";
import {
  getCustomerNotificationDefaults,
  getProviderNotificationDefaults,
} from "@/lib/notifications/notification-preferences-defaults";

/**
 * Persist customer notification_preferences when missing, sync users rollup.
 * Returns the effective preferences object.
 */
export async function materializeCustomerNotificationPreferences(
  supabase: SupabaseClient,
  userId: string,
  existing: Record<string, unknown> | null | undefined,
  options?: { marketingConsented?: boolean },
): Promise<Record<string, unknown>> {
  if (existing && typeof existing === "object" && Object.keys(existing).length > 0) {
    return existing;
  }

  const defaults = getCustomerNotificationDefaults({
    marketingConsented: options?.marketingConsented,
  });

  const { data: profileRow } = await supabase
    .from("user_profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileRow?.id) {
    await supabase
      .from("user_profiles")
      .update({ notification_preferences: defaults })
      .eq("user_id", userId);
  } else {
    await supabase.from("user_profiles").insert({
      user_id: userId,
      notification_preferences: defaults,
    });
  }

  try {
    const rollup = computeUserNotificationRollup(defaults);
    const patch: Record<string, unknown> = { ...rollup };
    if (rollup.whatsapp_notifications_enabled) {
      patch.whatsapp_opt_in_at = new Date().toISOString();
      patch.whatsapp_opt_in_source = "notification_preferences_materialize";
    }
    await supabase.from("users").update(patch).eq("id", userId);
  } catch {
    // best-effort rollup
  }

  return defaults;
}

/**
 * Persist provider-shaped notification_preferences when missing.
 */
export async function materializeProviderNotificationPreferences(
  supabase: SupabaseClient,
  userId: string,
  existing: Record<string, unknown> | null | undefined,
): Promise<Record<string, unknown>> {
  if (existing && typeof existing === "object" && Object.keys(existing).length > 0) {
    return existing;
  }

  const defaults = getProviderNotificationDefaults();

  const { data: profileRow } = await supabase
    .from("user_profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileRow?.id) {
    await supabase
      .from("user_profiles")
      .update({ notification_preferences: defaults })
      .eq("user_id", userId);
  } else {
    await supabase.from("user_profiles").insert({
      user_id: userId,
      notification_preferences: defaults,
    });
  }

  return defaults;
}
