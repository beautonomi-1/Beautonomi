import { resolveSingleActivePaycloudMerchant } from "@/lib/payments/paycloud-merchant-helpers";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * When a PayCloud terminal asset is delivered/activated, register it in paycloud_terminals.
 */
export async function registerPaycloudTerminalFromAsset(
  supabase: SupabaseClient,
  params: {
    terminalAssetId: string;
    providerId: string;
    tenantId: string;
    locationId?: string | null;
    serialNumber: string;
    displayName?: string;
  },
): Promise<{ terminalId: string } | null> {
  const serial = params.serialNumber.trim();
  if (!serial) return null;

  const { data: existing } = await supabase
    .from("paycloud_terminals")
    .select("id")
    .eq("tenant_id", params.tenantId)
    .eq("terminal_sn", serial)
    .maybeSingle();
  if (existing?.id) {
    await supabase
      .from("paycloud_terminals")
      .update({
        provider_id: params.providerId,
        location_id: params.locationId ?? null,
        terminal_asset_id: params.terminalAssetId,
        status: "active",
        source: "order",
        is_active: true,
        assigned_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    return { terminalId: existing.id };
  }

  const merchantPick = await resolveSingleActivePaycloudMerchant(supabase, params.tenantId);
  if ("error" in merchantPick) {
    console.warn(
      "[paycloud] registerPaycloudTerminalFromAsset:",
      merchantPick.error,
      params.tenantId,
    );
    return null;
  }

  const { data: terminal, error } = await supabase
    .from("paycloud_terminals")
    .insert({
      tenant_id: params.tenantId,
      provider_id: params.providerId,
      paycloud_merchant_id: merchantPick.id,
      terminal_sn: serial,
      display_name: params.displayName?.trim() || `Card machine ${serial.slice(-4)}`,
      location_id: params.locationId ?? null,
      terminal_asset_id: params.terminalAssetId,
      status: "active",
      source: "order",
      is_active: true,
      assigned_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      const { data: dup } = await supabase
        .from("paycloud_terminals")
        .select("id")
        .eq("tenant_id", params.tenantId)
        .eq("terminal_sn", serial)
        .maybeSingle();
      return dup?.id ? { terminalId: dup.id } : null;
    }
    throw error;
  }

  await supabase
    .from("provider_paycloud_settings")
    .upsert(
      {
        provider_id: params.providerId,
        tenant_id: params.tenantId,
        accept_paycloud: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "provider_id", ignoreDuplicates: true },
    );

  return { terminalId: terminal.id };
}
