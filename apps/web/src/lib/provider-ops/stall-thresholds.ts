import type { SupabaseClient } from "@supabase/supabase-js";

export const DEFAULT_STALL_THRESHOLD_HOURS = 24;
export const DEFAULT_DROPOFF_THRESHOLD_HOURS = 168;
export const DEFAULT_SLA_CONTACT_STALLED_HOURS = 4;
export const DEFAULT_SLA_CONTACT_DROPPED_HOURS = 24;

export interface ProviderOpsStallSettings {
  stall_threshold_hours: number;
  dropoff_threshold_hours: number;
  auto_assign_enabled: boolean;
  auto_sms_on_stall: boolean;
  sla_contact_stalled_hours: number;
  sla_contact_dropped_hours: number;
}

export type StallStatus = "active" | "slowing" | "stalled" | "dropped_off";

export async function loadProviderOpsStallSettings(
  supabase: SupabaseClient,
  tenantId: string
): Promise<ProviderOpsStallSettings> {
  const { data: settingsRow } = await supabase
    .from("platform_settings")
    .select("settings")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const allSettings = (settingsRow?.settings as Record<string, unknown>) || {};
  const opsSettings = (allSettings.provider_ops as Record<string, unknown>) || {};

  return {
    stall_threshold_hours: Number(
      opsSettings.stall_threshold_hours ?? DEFAULT_STALL_THRESHOLD_HOURS
    ),
    dropoff_threshold_hours: Number(
      opsSettings.dropoff_threshold_hours ?? DEFAULT_DROPOFF_THRESHOLD_HOURS
    ),
    auto_assign_enabled: Boolean(opsSettings.auto_assign_enabled ?? false),
    auto_sms_on_stall: Boolean(opsSettings.auto_sms_on_stall ?? false),
    sla_contact_stalled_hours: Number(
      opsSettings.sla_contact_stalled_hours ?? DEFAULT_SLA_CONTACT_STALLED_HOURS
    ),
    sla_contact_dropped_hours: Number(
      opsSettings.sla_contact_dropped_hours ?? DEFAULT_SLA_CONTACT_DROPPED_HOURS
    ),
  };
}

export function computeStallStatus(
  updatedAt: string | null,
  stallThresholdHours: number,
  dropOffThresholdHours: number
): StallStatus {
  if (!updatedAt) return "stalled";
  const hours = (Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60);
  if (hours > dropOffThresholdHours) return "dropped_off";
  if (hours > stallThresholdHours) return "stalled";
  if (hours > stallThresholdHours / 2) return "slowing";
  return "active";
}

export function isStalledByThreshold(
  lastProgressAt: string | null,
  stallThresholdHours: number
): boolean {
  if (!lastProgressAt) return true;
  const hours =
    (Date.now() - new Date(lastProgressAt).getTime()) / (1000 * 60 * 60);
  return hours > stallThresholdHours;
}
