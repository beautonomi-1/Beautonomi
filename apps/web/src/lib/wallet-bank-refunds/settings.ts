import type { SupabaseClient } from "@supabase/supabase-js";

export type WalletBankRefundFeeType = "fixed" | "percentage";

export type WalletBankRefundSettings = {
  enabled: boolean;
  min_amount: number;
  max_amount_per_request: number | null;
  fee_type: WalletBankRefundFeeType;
  fee_value: number;
  sla_business_days: number;
  help_text: string | null;
};

const DEFAULTS: WalletBankRefundSettings = {
  enabled: true,
  min_amount: 50,
  max_amount_per_request: null,
  fee_type: "fixed",
  fee_value: 0,
  sla_business_days: 5,
  help_text: null,
};

export function computeWalletBankRefundFee(
  amount: number,
  settings: Pick<WalletBankRefundSettings, "fee_type" | "fee_value">,
): { fee: number; net: number } {
  const value = Math.max(0, Number(settings.fee_value) || 0);
  const raw = settings.fee_type === "percentage" ? (amount * value) / 100 : value;
  const fee = Math.round(Math.min(raw, amount) * 100) / 100;
  return { fee, net: Math.round((amount - fee) * 100) / 100 };
}

function readFromPlatformSettings(settings: Record<string, unknown> | null | undefined): Partial<WalletBankRefundSettings> {
  const finance = settings?.finance;
  if (!finance || typeof finance !== "object") return {};
  const wbr = (finance as { wallet_bank_refunds?: unknown }).wallet_bank_refunds;
  if (!wbr || typeof wbr !== "object") return {};
  const row = wbr as Record<string, unknown>;
  const out: Partial<WalletBankRefundSettings> = {};
  if (typeof row.enabled === "boolean") out.enabled = row.enabled;
  if (typeof row.min_amount === "number") out.min_amount = row.min_amount;
  if (row.max_amount_per_request === null) out.max_amount_per_request = null;
  else if (typeof row.max_amount_per_request === "number") out.max_amount_per_request = row.max_amount_per_request;
  if (row.fee_type === "fixed" || row.fee_type === "percentage") out.fee_type = row.fee_type;
  if (typeof row.fee_value === "number" && row.fee_value >= 0) out.fee_value = row.fee_value;
  if (typeof row.sla_business_days === "number" && row.sla_business_days > 0) {
    out.sla_business_days = Math.round(row.sla_business_days);
  }
  if (typeof row.help_text === "string") out.help_text = row.help_text;
  else if (row.help_text === null) out.help_text = null;
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

export async function getEffectiveWalletBankRefundSettings(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<WalletBankRefundSettings> {
  const tenantRow = await fetchActivePlatformSettingsRow(supabase, tenantId);
  const tenantPartial = readFromPlatformSettings(tenantRow?.settings ?? null);

  const globalRow = await fetchActivePlatformSettingsRow(supabase, null);
  const globalPartial = readFromPlatformSettings(globalRow?.settings ?? null);

  return {
    ...DEFAULTS,
    ...globalPartial,
    ...tenantPartial,
  };
}

export async function setWalletBankRefundSettingsForScope(
  supabase: SupabaseClient,
  scopeTenantId: string | null,
  patch: Partial<WalletBankRefundSettings>,
): Promise<void> {
  const row = await fetchActivePlatformSettingsRow(supabase, scopeTenantId);
  if (!row?.id) {
    throw new Error("platform_settings row not found");
  }
  const current = (row.settings ?? {}) as Record<string, unknown>;
  const finance = (current.finance && typeof current.finance === "object"
    ? { ...(current.finance as Record<string, unknown>) }
    : {}) as Record<string, unknown>;
  const prev = readFromPlatformSettings(current);
  finance.wallet_bank_refunds = { ...DEFAULTS, ...prev, ...patch };
  const nextSettings = { ...current, finance };

  const { error } = await supabase.from("platform_settings").update({ settings: nextSettings }).eq("id", row.id);
  if (error) throw error;
}
