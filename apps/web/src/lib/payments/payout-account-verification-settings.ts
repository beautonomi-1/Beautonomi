import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScopedSource } from "@/lib/tenant/scoped-overrides";

type PlatformSettingsRow = {
  id?: string;
  settings?: Record<string, unknown> | null;
};

function readSkipFromSettings(settings: Record<string, unknown> | null | undefined): boolean | null {
  const paystack = settings?.paystack;
  if (!paystack || typeof paystack !== "object") return null;
  const v = (paystack as { skip_payout_account_verification?: unknown }).skip_payout_account_verification;
  if (typeof v !== "boolean") return null;
  return v;
}

async function fetchActivePlatformSettingsRow(
  supabase: SupabaseClient,
  tenantId: string | null,
): Promise<PlatformSettingsRow | null> {
  let q = supabase
    .from("platform_settings")
    .select("id, settings")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1);
  q = tenantId == null ? q.is("tenant_id", null) : q.eq("tenant_id", tenantId);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  return (data as PlatformSettingsRow | null) ?? null;
}

/**
 * Effective runtime flag: when true, providers should not see the Paystack verify
 * button and the server skips Paystack `bank/resolve` on add-account.
 */
export async function getEffectiveSkipPayoutAccountVerification(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<{ skip: boolean; source: ScopedSource }> {
  const tenantRow = await fetchActivePlatformSettingsRow(supabase, tenantId);
  const tenantSkip = readSkipFromSettings(
    (tenantRow?.settings as Record<string, unknown> | null) ?? null,
  );
  if (tenantSkip === true) {
    return { skip: true, source: "tenant" };
  }
  if (tenantSkip === false) {
    return { skip: false, source: "tenant" };
  }

  const globalRow = await fetchActivePlatformSettingsRow(supabase, null);
  const globalSkip = readSkipFromSettings(
    (globalRow?.settings as Record<string, unknown> | null) ?? null,
  );
  if (globalSkip === true) {
    return { skip: true, source: "global" };
  }
  return { skip: false, source: globalSkip === false ? "global" : "none" };
}

export function showVerifyAccountButton(skip: boolean): boolean {
  return !skip;
}

/** Read skip flag on a single platform_settings scope row (no tenant→global fallback). */
export async function getSkipPayoutAccountVerificationOnScope(
  supabase: SupabaseClient,
  scopeTenantId: string | null,
): Promise<boolean> {
  const row = await fetchActivePlatformSettingsRow(supabase, scopeTenantId);
  return readSkipFromSettings((row?.settings as Record<string, unknown> | null) ?? null) === true;
}

/**
 * Persist `skip_payout_account_verification` on the admin-selected scope row
 * (tenant override or global default).
 */
export async function setSkipPayoutAccountVerificationForScope(
  supabase: SupabaseClient,
  scopeTenantId: string | null,
  skip: boolean,
): Promise<void> {
  const existing = await fetchActivePlatformSettingsRow(supabase, scopeTenantId);
  const prevSettings = (existing?.settings as Record<string, unknown>) ?? {};
  const prevPaystack =
    prevSettings.paystack && typeof prevSettings.paystack === "object"
      ? (prevSettings.paystack as Record<string, unknown>)
      : {};
  const updatedSettings = {
    ...prevSettings,
    paystack: {
      ...prevPaystack,
      skip_payout_account_verification: skip,
    },
  };

  if (existing?.id) {
    const { error } = await supabase
      .from("platform_settings")
      .update({
        settings: updatedSettings,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from("platform_settings").insert({
    tenant_id: scopeTenantId,
    settings: updatedSettings,
    is_active: true,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}
