import type { SupabaseClient } from "@supabase/supabase-js";

export type AutoWalletCreditSettings = {
  enabled: boolean;
};

const DEFAULTS: AutoWalletCreditSettings = { enabled: false };

function readFromPlatformSettings(
  settings: Record<string, unknown> | null | undefined,
): Partial<AutoWalletCreditSettings> {
  const finance = settings?.finance;
  if (!finance || typeof finance !== "object") return {};
  const awc = (finance as { auto_wallet_credit_exceptions?: unknown }).auto_wallet_credit_exceptions;
  if (!awc || typeof awc !== "object") return {};
  const row = awc as Record<string, unknown>;
  const out: Partial<AutoWalletCreditSettings> = {};
  if (typeof row.enabled === "boolean") out.enabled = row.enabled;
  return out;
}

async function fetchActivePlatformSettingsRow(
  supabase: SupabaseClient,
  tenantId: string | null,
): Promise<{ id: string; settings?: Record<string, unknown> | null } | null> {
  let q = supabase
    .from("platform_settings")
    .select("id, settings")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1);
  q = tenantId == null ? q.is("tenant_id", null) : q.eq("tenant_id", tenantId);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  return (data as { id: string; settings?: Record<string, unknown> | null } | null) ?? null;
}

export async function getEffectiveAutoWalletCreditSettings(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<AutoWalletCreditSettings> {
  const tenantRow = await fetchActivePlatformSettingsRow(supabase, tenantId);
  const tenantPartial = readFromPlatformSettings(tenantRow?.settings ?? null);
  const globalRow = await fetchActivePlatformSettingsRow(supabase, null);
  const globalPartial = readFromPlatformSettings(globalRow?.settings ?? null);
  return { ...DEFAULTS, ...globalPartial, ...tenantPartial };
}

export async function setAutoWalletCreditSettingsForScope(
  supabase: SupabaseClient,
  scopeTenantId: string | null,
  patch: Partial<AutoWalletCreditSettings>,
): Promise<void> {
  const row = await fetchActivePlatformSettingsRow(supabase, scopeTenantId);
  if (!row?.id) throw new Error("platform_settings row not found");
  const current = (row.settings ?? {}) as Record<string, unknown>;
  const finance = (current.finance && typeof current.finance === "object"
    ? { ...(current.finance as Record<string, unknown>) }
    : {}) as Record<string, unknown>;
  const prev = readFromPlatformSettings(current);
  finance.auto_wallet_credit_exceptions = { ...DEFAULTS, ...prev, ...patch };
  const nextSettings = { ...current, finance };
  const { error } = await supabase.from("platform_settings").update({ settings: nextSettings }).eq("id", row.id);
  if (error) throw error;
}
