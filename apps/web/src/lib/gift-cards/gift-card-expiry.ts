import type { SupabaseClient } from "@supabase/supabase-js";

/** Default gift card validity per SA CPA guidance (36 months). */
export const DEFAULT_GIFT_CARD_VALIDITY_MONTHS = 36;

/**
 * Resolve gift card validity in months from platform_settings.settings.gift_cards.validity_months.
 */
export async function resolveGiftCardValidityMonths(
  supabase: SupabaseClient,
  tenantId: string | null,
): Promise<number> {
  if (!tenantId) return DEFAULT_GIFT_CARD_VALIDITY_MONTHS;

  // Settings lookups must never block issuance; fall back to the default.
  try {
    const { data: tenantRow } = await supabase
      .from("platform_settings")
      .select("settings")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    const tenantMonths = readValidityMonths((tenantRow as { settings?: unknown } | null)?.settings);
    if (tenantMonths != null) return tenantMonths;

    const { data: globalRow } = await supabase
      .from("platform_settings")
      .select("settings")
      .is("tenant_id", null)
      .maybeSingle();

    return readValidityMonths((globalRow as { settings?: unknown } | null)?.settings)
      ?? DEFAULT_GIFT_CARD_VALIDITY_MONTHS;
  } catch (err) {
    console.warn("[gift-card-expiry] validity lookup failed; using default", err);
    return DEFAULT_GIFT_CARD_VALIDITY_MONTHS;
  }
}

function readValidityMonths(settings: unknown): number | null {
  if (!settings || typeof settings !== "object") return null;
  const giftCards = (settings as { gift_cards?: { validity_months?: unknown } }).gift_cards;
  const raw = giftCards?.validity_months;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 1 || n > 120) return null;
  return Math.floor(n);
}

/** Compute expires_at ISO string from issuance time and validity months. */
export function computeGiftCardExpiresAt(from: Date, validityMonths: number): string {
  const d = new Date(from);
  d.setMonth(d.getMonth() + validityMonths);
  return d.toISOString();
}
