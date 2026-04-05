import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type TenantRegionConfig = {
  tenantId: string;
  tenantSlug: string;
  regionCode: string;
  defaultCurrency: string;
  defaultLanguage: string;
  defaultTimezone: string;
  regionDisplayName: string;
  phoneCountryCode: string;
  /** `public.regions.id` when `tenants.region_code` matches an active row (migration 377). Used for region_secrets / gateways. */
  regionId: string | null;
  /** `region_settings.settings` JSON overlay for this region (optional keys: phone_country_code, region_display_name, …). */
  regionSettings?: Record<string, unknown>;
};

/**
 * Resolve region/locale defaults for a tenant from the canonical sources:
 * - tenants (slug, region_code, default_currency, default_language, default_timezone)
 * - regions + region_settings (GLOBAL_EXPANSION_GUIDE — same region_code as ISO2)
 * - iso_countries (code -> phone_country_code, name)
 *
 * This is the single backend surface that other modules should call instead of
 * hard-coding ISO currency / phone / place defaults (use `LAST_RESORT_CURRENCY` only as last resort).
 */
export async function getTenantRegionConfig(tenantId: string): Promise<TenantRegionConfig | null> {
  if (!tenantId) return null;

  const supabase = getSupabaseAdmin();

  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("id, slug, region_code, default_currency, default_language, default_timezone, name")
    .eq("id", tenantId)
    .maybeSingle();

  if (tenantError || !tenant) {
    console.error("getTenantRegionConfig: failed to load tenant row", {
      tenantId,
      error: tenantError,
    });
    return null;
  }

  const regionCodeKey = String(tenant.region_code ?? "")
    .trim()
    .toUpperCase();

  const isoCode = regionCodeKey || String(tenant.region_code ?? "").trim();

  const [{ data: country, error: countryError }, { data: region }] = await Promise.all([
    isoCode
      ? supabase
          .from("iso_countries")
          .select("code, name, phone_country_code")
          .eq("code", isoCode)
          .eq("is_active", true)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    regionCodeKey
      ? supabase
          .from("regions")
          .select("id, name")
          .eq("code", regionCodeKey)
          .eq("is_active", true)
          .maybeSingle()
      : Promise.resolve({ data: null as { id: string; name: string } | null }),
  ]);

  if (countryError) {
    console.error("getTenantRegionConfig: failed to load iso country row", {
      region_code: tenant.region_code,
      error: countryError,
    });
  }

  let regionId: string | null = null;
  let regionSettings: Record<string, unknown> | undefined;

  if (region?.id) {
    regionId = region.id;
    const { data: rs } = await supabase
      .from("region_settings")
      .select("settings")
      .eq("region_id", region.id)
      .eq("is_active", true)
      .maybeSingle();
    const raw = (rs as { settings?: unknown } | null)?.settings;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      regionSettings = raw as Record<string, unknown>;
    }
  }

  const phoneFromSettings =
    typeof regionSettings?.phone_country_code === "string" ? regionSettings.phone_country_code.trim() : "";
  const displayFromSettings =
    typeof regionSettings?.region_display_name === "string" ? regionSettings.region_display_name.trim() : "";

  const phoneCountryCode =
    phoneFromSettings || country?.phone_country_code || "+27";
  const regionDisplayName =
    displayFromSettings || country?.name || tenant.name || region?.name || "South Africa";

  return {
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    regionCode: tenant.region_code,
    defaultCurrency: tenant.default_currency,
    defaultLanguage: tenant.default_language,
    defaultTimezone: tenant.default_timezone,
    regionDisplayName,
    phoneCountryCode,
    regionId,
    ...(regionSettings && Object.keys(regionSettings).length > 0 ? { regionSettings } : {}),
  };
}

