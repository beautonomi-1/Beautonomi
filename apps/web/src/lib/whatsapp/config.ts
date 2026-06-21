import type { SupabaseClient } from "@supabase/supabase-js";

export async function isWhatsAppNotificationsEnabled(
  supabase: SupabaseClient,
  tenantId?: string | null,
): Promise<boolean> {
  try {
    let query = supabase
      .from("platform_settings")
      .select("settings")
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1);

    query = tenantId ? query.eq("tenant_id", tenantId) : query.is("tenant_id", null);
    const { data } = await query.maybeSingle();
    const notifications = (data?.settings as { notifications?: Record<string, unknown> } | undefined)
      ?.notifications;
    if (notifications?.whatsapp_enabled === false) return false;
    if (notifications?.whatsapp_enabled === true) return true;

    const twilio = (data?.settings as { twilio?: Record<string, unknown> } | undefined)?.twilio;
    const mg = String(twilio?.message_service_sid ?? "").trim();
    return !!(twilio?.enabled && mg);
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
