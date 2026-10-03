import type { SupabaseClient } from "@supabase/supabase-js";

const ZA_REGION_CODE = "ZA";
const PAYSTACK_SECRET_KEY = "paystack_secret_key";
const PAYSTACK_PUBLIC_SETTING = "paystack_public_key";

export type SyncPaystackZaRegionInput = {
  secretKey?: string | null;
  publicKey?: string | null;
  /** When true, remove ZA region Paystack rows so platform_secrets / env take precedence. */
  clearRegionOverride?: boolean;
};

/**
 * Keep ZA `region_secrets` / `region_settings` aligned with platform or Vercel keys
 * so tenant-scoped Paystack resolution matches admin / env configuration.
 */
export async function syncPaystackKeysToZaRegion(
  supabase: SupabaseClient,
  input: SyncPaystackZaRegionInput,
): Promise<{ regionId: string | null; updated: string[] }> {
  const updated: string[] = [];

  const { data: regionRow, error: regionErr } = await supabase
    .from("regions")
    .select("id")
    .eq("code", ZA_REGION_CODE)
    .eq("is_active", true)
    .maybeSingle();

  if (regionErr) throw regionErr;
  const regionId = (regionRow as { id?: string } | null)?.id ?? null;
  if (!regionId) return { regionId: null, updated };

  if (input.clearRegionOverride) {
    const { error: delErr } = await supabase
      .from("region_secrets")
      .delete()
      .eq("region_id", regionId)
      .eq("key", PAYSTACK_SECRET_KEY);
    if (delErr) throw delErr;
    updated.push("region_secrets_cleared");
  } else if (input.secretKey?.trim()) {
    const secret = input.secretKey.trim();
    const { error: upsertErr } = await supabase.from("region_secrets").upsert(
      {
        region_id: regionId,
        key: PAYSTACK_SECRET_KEY,
        value_encrypted: secret,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "region_id,key" },
    );
    if (upsertErr) throw upsertErr;
    updated.push("region_secrets");
  }

  const publicKey = input.publicKey?.trim();
  if (input.clearRegionOverride && !publicKey) {
    const { data: settingsRow } = await supabase
      .from("region_settings")
      .select("id, settings")
      .eq("region_id", regionId)
      .maybeSingle();
    if (settingsRow?.id) {
      const settings = { ...((settingsRow as { settings?: Record<string, unknown> }).settings ?? {}) };
      delete settings[PAYSTACK_PUBLIC_SETTING];
      const { error: updErr } = await supabase
        .from("region_settings")
        .update({ settings, updated_at: new Date().toISOString() })
        .eq("id", settingsRow.id);
      if (updErr) throw updErr;
      updated.push("region_settings_public_cleared");
    }
  } else if (publicKey) {
    const { data: settingsRow } = await supabase
      .from("region_settings")
      .select("id, settings")
      .eq("region_id", regionId)
      .maybeSingle();

    const settings = {
      ...((settingsRow as { settings?: Record<string, unknown> } | null)?.settings ?? {}),
      [PAYSTACK_PUBLIC_SETTING]: publicKey,
    };

    if (settingsRow?.id) {
      const { error: updErr } = await supabase
        .from("region_settings")
        .update({ settings, updated_at: new Date().toISOString() })
        .eq("id", settingsRow.id);
      if (updErr) throw updErr;
    } else {
      const { error: insErr } = await supabase.from("region_settings").insert({
        region_id: regionId,
        settings,
        is_active: true,
      });
      if (insErr) throw insErr;
    }
    updated.push("region_settings_public");
  }

  return { regionId, updated };
}
