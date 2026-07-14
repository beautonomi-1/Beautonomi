import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveTwilioVoiceCredentials } from "@/lib/integrations/twilio";

export interface VoiceIntegrationConfigRow {
  id: string;
  tenant_id: string | null;
  twilio_voice_enabled: boolean;
  salestrail_enabled: boolean;
  salestrail_webhook_username: string | null;
  salestrail_webhook_password: string | null;
  salestrail_default_tenant_id: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CallsIntegrationStatus {
  config: VoiceIntegrationConfigRow | null;
  twilioVoiceConfigured: boolean;
}

async function fetchConfigRow(
  supabase: SupabaseClient,
  tenantId: string | null,
): Promise<VoiceIntegrationConfigRow | null> {
  let q = supabase.from("voice_integration_config").select("*");
  if (tenantId) {
    q = q.eq("tenant_id", tenantId);
  } else {
    q = q.is("tenant_id", null);
  }
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  return (data as VoiceIntegrationConfigRow | null) ?? null;
}

export async function getGlobalCallsIntegrationConfig(
  supabase: SupabaseClient,
): Promise<VoiceIntegrationConfigRow | null> {
  return fetchConfigRow(supabase, null);
}

/**
 * Resolve voice integration config: tenant-specific row, else global (tenant_id IS NULL).
 */
export async function getCallsIntegrationConfig(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<CallsIntegrationStatus> {
  let config = await fetchConfigRow(supabase, tenantId);
  if (!config) {
    config = await fetchConfigRow(supabase, null);
  }

  const twilioVoiceConfigured = Boolean(
    await resolveTwilioVoiceCredentials(supabase, tenantId),
  );

  return { config, twilioVoiceConfigured };
}

export function isTwilioVoiceEnabled(status: CallsIntegrationStatus): boolean {
  return Boolean(status.config?.twilio_voice_enabled);
}

export function isSalestrailEnabled(status: CallsIntegrationStatus): boolean {
  return Boolean(
    status.config?.salestrail_enabled &&
      status.config.salestrail_webhook_username?.trim() &&
      status.config.salestrail_webhook_password?.trim(),
  );
}

export function salestrailWebhookCredentials(
  config: VoiceIntegrationConfigRow | null,
): { username: string; password: string } | null {
  if (!config?.salestrail_enabled) return null;
  const username = config.salestrail_webhook_username?.trim() ?? "";
  const password = config.salestrail_webhook_password?.trim() ?? "";
  if (!username || !password) return null;
  return { username, password };
}

/**
 * All configs (global + tenant rows) with Salestrail enabled and credentials set.
 * Tenant rows sort first so tenant-specific credentials win over global ones.
 */
export async function listEnabledSalestrailConfigs(
  supabase: SupabaseClient,
): Promise<VoiceIntegrationConfigRow[]> {
  const { data, error } = await supabase
    .from("voice_integration_config")
    .select("*")
    .eq("salestrail_enabled", true);
  if (error) throw error;
  const rows = (data ?? []) as VoiceIntegrationConfigRow[];
  return rows
    .filter((row) => salestrailWebhookCredentials(row) !== null)
    .sort((a, b) => {
      if (a.tenant_id && !b.tenant_id) return -1;
      if (!a.tenant_id && b.tenant_id) return 1;
      return 0;
    });
}
