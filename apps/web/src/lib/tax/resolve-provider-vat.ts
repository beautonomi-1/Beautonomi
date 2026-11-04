import type { SupabaseClient } from "@supabase/supabase-js";
import { computeVat } from "@beautonomi/utils";

export type ProviderVatTreatment = "standard" | "zero_or_exempt";

export type ResolvedProviderVat = {
  registered: boolean;
  ratePercent: number;
  inclusive: boolean;
  vatNumber: string | null;
  source: "override" | "provider" | "country_default" | "none";
};

export type ProviderVatRow = {
  tax_rate_percent?: number | null;
  tax_inclusive?: boolean | null;
  is_vat_registered?: boolean | null;
  vat_number?: string | null;
  country_code?: string | null;
  tax_rate_override_percent?: number | null;
};

const DEFAULT_INCLUSIVE = true;

function normalizeCountryCode(code: string | null | undefined): string | null {
  const c = (code ?? "").trim().toUpperCase();
  return c.length >= 2 ? c.slice(0, 2) : null;
}

async function fetchPlatformDefaultVatRateFromPlatformSettings(
  supabase: SupabaseClient,
): Promise<number | null> {
  // Legacy fallback for environments where `tax_rates` table (F17) is not present.
  // Keep this tolerant: never assume VAT unless explicitly configured.
  try {
    const { data: platformSettings } = await supabase
      .from("platform_settings")
      .select("settings")
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const raw = (platformSettings as { settings?: unknown } | null)?.settings as
      | { taxes?: { default_tax_rate?: unknown } }
      | null
      | undefined;
    const rate = raw?.taxes?.default_tax_rate;
    if (rate == null || rate === "") return null;
    const n = Number(rate);
    return Number.isFinite(n) ? Math.max(0, n) : null;
  } catch {
    return null;
  }
}

/**
 * Country standard VAT rate from tax_rates (effective window). Returns null if missing.
 */
export async function fetchCountryStandardVatRate(
  supabase: SupabaseClient,
  countryCode: string | null,
  at: Date = new Date(),
): Promise<number | null> {
  const cc = normalizeCountryCode(countryCode);
  const windowFilter = `effective_to.is.null,effective_to.gt.${at.toISOString()}`;

  try {
    if (cc) {
      const { data: countryRow } = await supabase
        .from("tax_rates")
        .select("rate")
        .eq("country_code", cc)
        .lte("effective_from", at.toISOString())
        .or(windowFilter)
        .order("effective_from", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (countryRow?.rate != null) return Math.max(0, Number(countryRow.rate));
    }

    const { data: defaultRow } = await supabase
      .from("tax_rates")
      .select("rate")
      .eq("is_platform_default", true)
      .lte("effective_from", at.toISOString())
      .or(windowFilter)
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (defaultRow?.rate != null) return Math.max(0, Number(defaultRow.rate));
  } catch {
    // `tax_rates` may not exist in older DB snapshots. Fall through to platform_settings.
  }

  return await fetchPlatformDefaultVatRateFromPlatformSettings(supabase);
}

/**
 * Resolve effective VAT settings for a provider (bookings / retail / shop).
 * Not registered → 0% always. Registered → country rate unless admin override.
 */
export async function resolveProviderVat(
  supabase: SupabaseClient,
  provider: ProviderVatRow,
): Promise<ResolvedProviderVat> {
  const registered = provider.is_vat_registered === true;
  const inclusive = provider.tax_inclusive ?? DEFAULT_INCLUSIVE;
  const vatNumber = registered ? (provider.vat_number?.trim() || null) : null;

  if (!registered) {
    return {
      registered: false,
      ratePercent: 0,
      inclusive,
      vatNumber: null,
      source: "none",
    };
  }

  const override = provider.tax_rate_override_percent;
  if (override != null && Number.isFinite(Number(override))) {
    return {
      registered: true,
      ratePercent: Math.max(0, Number(override)),
      inclusive,
      vatNumber,
      source: "override",
    };
  }

  const countryRate = await fetchCountryStandardVatRate(
    supabase,
    provider.country_code ?? null,
  );
  if (countryRate != null) {
    return {
      registered: true,
      ratePercent: countryRate,
      inclusive,
      vatNumber,
      source: "country_default",
    };
  }

  const explicit = provider.tax_rate_percent;
  if (explicit != null && Number.isFinite(Number(explicit))) {
    return {
      registered: true,
      ratePercent: Math.max(0, Number(explicit)),
      inclusive,
      vatNumber,
      source: "provider",
    };
  }

  return {
    registered: true,
    ratePercent: 0,
    inclusive,
    vatNumber,
    source: "none",
  };
}

/** Per-line rate: zero_or_exempt → 0; otherwise provider rate. */
export function lineVatRatePercent(
  providerVat: ResolvedProviderVat,
  lineTreatment: ProviderVatTreatment | null | undefined,
): number {
  if (!providerVat.registered) return 0;
  if (lineTreatment === "zero_or_exempt") return 0;
  return providerVat.ratePercent;
}

export { computeVat };
