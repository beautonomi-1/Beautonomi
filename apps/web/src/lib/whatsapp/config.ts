import type { SupabaseClient } from "@supabase/supabase-js";

type SettingsRow = { settings?: Record<string, unknown> } | null;

function whatsAppEnabledFromSettings(settings: Record<string, unknown> | undefined): boolean | null {
  const notifications = settings?.notifications as Record<string, unknown> | undefined;
  if (notifications?.whatsapp_enabled === false) return false;
  if (notifications?.whatsapp_enabled === true) return true;
  const twilio = settings?.twilio as Record<string, unknown> | undefined;
  const mg = String(twilio?.message_service_sid ?? "").trim();
  if (twilio?.enabled && mg) return true;
  return null;
}

async function loadPlatformSettingsRow(
  supabase: SupabaseClient,
  tenantId?: string | null,
): Promise<SettingsRow> {
  let query = supabase
    .from("platform_settings")
    .select("settings")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1);

  query = tenantId ? query.eq("tenant_id", tenantId) : query.is("tenant_id", null);
  const { data } = await query.maybeSingle();
  return data as SettingsRow;
}

export async function isWhatsAppNotificationsEnabled(
  supabase: SupabaseClient,
  tenantId?: string | null,
): Promise<boolean> {
  try {
    if (tenantId) {
      const tenantRow = await loadPlatformSettingsRow(supabase, tenantId);
      const tenantSettings = tenantRow?.settings as Record<string, unknown> | undefined;
      if (tenantSettings) {
        const fromTenant = whatsAppEnabledFromSettings(tenantSettings);
        if (fromTenant === false) return false;
        if (fromTenant === true) return true;
      }
      const globalRow = await loadPlatformSettingsRow(supabase, null);
      const globalSettings = globalRow?.settings as Record<string, unknown> | undefined;
      const fromGlobal = whatsAppEnabledFromSettings(globalSettings);
      if (fromGlobal === false) return false;
      if (fromGlobal === true) return true;
      return false;
    }

    const globalRow = await loadPlatformSettingsRow(supabase, null);
    const fromGlobal = whatsAppEnabledFromSettings(
      globalRow?.settings as Record<string, unknown> | undefined,
    );
    if (fromGlobal === false) return false;
    if (fromGlobal === true) return true;
    return false;
  } catch {
    return false;
  }
}

export function buildOrdinalContentVariables(
  mappings: Array<{ ordinal?: number; var?: string; sample?: string }> | null | undefined,
  variables: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!Array.isArray(mappings)) return out;
  for (const m of mappings) {
    const ord = m.ordinal;
    const name = m.var?.trim();
    if (ord == null) continue;
    const val = name && variables[name] != null ? String(variables[name]) : m.sample?.trim();
    if (val) out[String(ord)] = val;
  }
  return out;
}
