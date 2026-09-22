import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_SLA_CONTACT_DROPPED_HOURS,
  DEFAULT_SLA_CONTACT_STALLED_HOURS,
  DEFAULT_STALL_THRESHOLD_HOURS,
  DEFAULT_DROPOFF_THRESHOLD_HOURS,
} from "@/lib/provider-ops/stall-thresholds";

export const DEFAULT_SLA_FIRST_CONTACT_HOURS = 48;
export const DEFAULT_SLA_STAGE_STALE_HOURS = 168;
export const DEFAULT_HIGH_VALUE_THRESHOLD = 5000;

export type ProviderOpsTenantSettings = {
  stall_threshold_hours: number;
  dropoff_threshold_hours: number;
  auto_assign_enabled: boolean;
  auto_sms_on_stall: boolean;
  sla_contact_stalled_hours: number;
  sla_contact_dropped_hours: number;
  sla_first_contact_hours: number;
  sla_stage_stale_hours: number;
  high_value_threshold: number;
};

const DEFAULTS: ProviderOpsTenantSettings = {
  stall_threshold_hours: DEFAULT_STALL_THRESHOLD_HOURS,
  dropoff_threshold_hours: DEFAULT_DROPOFF_THRESHOLD_HOURS,
  auto_assign_enabled: false,
  auto_sms_on_stall: false,
  sla_contact_stalled_hours: DEFAULT_SLA_CONTACT_STALLED_HOURS,
  sla_contact_dropped_hours: DEFAULT_SLA_CONTACT_DROPPED_HOURS,
  sla_first_contact_hours: DEFAULT_SLA_FIRST_CONTACT_HOURS,
  sla_stage_stale_hours: DEFAULT_SLA_STAGE_STALE_HOURS,
  high_value_threshold: DEFAULT_HIGH_VALUE_THRESHOLD,
};

export async function loadProviderOpsSettings(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<ProviderOpsTenantSettings> {
  const { data: settings } = await supabase
    .from("platform_settings")
    .select("settings")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const allSettings = (settings?.settings as Record<string, unknown>) || {};
  const opsSettings = (allSettings.provider_ops as Record<string, unknown>) || {};
  return { ...DEFAULTS, ...opsSettings } as ProviderOpsTenantSettings;
}
