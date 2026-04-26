import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { resolveTenantFromRequest, resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { DEFAULT_SUPPORTED_LANGUAGE_CODES } from "@/lib/i18n/config";

/**
 * GET /api/public/platform-settings
 * 
 * Get platform-wide locale and currency settings (public endpoint)
 */
export async function GET(request: Request) {
  try {
    const supabase = await getSupabaseServer();
    const tenant = await resolveTenantFromRequest(request);
    const tenantId = tenant?.id ?? "";

    // Get platform settings
    let tenantSettings: Record<string, any> | null = null;
    let tenantError: unknown = null;
    if (tenantId) {
      const tenantRes = await supabase
        .from("platform_settings")
        .select("*")
        .eq("is_active", true)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      tenantSettings = (tenantRes.data as Record<string, any> | null) ?? null;
      tenantError = tenantRes.error ?? null;
    }
    const { data: globalSettings, error: globalError } = await supabase
      .from("platform_settings")
      .select("*")
      .eq("is_active", true)
      .is("tenant_id", null)
      .maybeSingle();
    const settings = tenantSettings ?? globalSettings;
    const error = tenantError ?? globalError;

    const errCode =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code ?? "")
        : "";
    if (error && errCode !== "PGRST116") {
      // PGRST116 = no rows returned, which is okay for first time setup
      console.error("Error fetching platform settings:", error);
    }

    // Resolve tenant-region defaults (currency, locale, timezone) so we never hard-code ZA/South Africa.
    const tenantRegionConfig = tenantId ? await getTenantRegionConfig(tenantId) : null;

    // Get currency info if currency code is set
    let currencyInfo = null;
    const effectiveCurrency =
      settings?.localization?.default_currency || tenantRegionConfig?.defaultCurrency || LAST_RESORT_CURRENCY;
    if (effectiveCurrency) {
      const { data: currency } = await supabase
        .from("iso_currencies")
        .select("code, symbol, name, decimal_places")
        .eq("code", effectiveCurrency)
        .eq("is_active", true)
        .maybeSingle();

      if (currency) {
        currencyInfo = currency;
      }
    }

    // Supported languages from iso_languages (single source with Admin ISO Codes)
    let supportedLanguages: string[] = settings?.localization?.supported_languages ?? [];
    let languages_meta: Array<{ code: string; name: string; nativeName: string; isDefault: boolean }> = [];
    const { data: isoLanguages } = await supabase
      .from("iso_languages")
      .select("code, name, native_name, is_default")
      .eq("is_active", true)
      .order("name", { ascending: true });
    if (isoLanguages?.length) {
      supportedLanguages = isoLanguages.map((r) => r.code);
      languages_meta = isoLanguages.map((r) => ({
        code: r.code,
        name: r.name,
        nativeName: r.native_name ?? r.name,
        isDefault: Boolean(r.is_default),
      }));
    }
    if (!supportedLanguages.length) {
      supportedLanguages = [tenantRegionConfig?.defaultLanguage || "en"];
    }

    // Merge settings with currency info
    const response = {
      default_currency:
        settings?.localization?.default_currency || tenantRegionConfig?.defaultCurrency || LAST_RESORT_CURRENCY,
      default_language:
        settings?.localization?.default_language || tenantRegionConfig?.defaultLanguage || "en",
      timezone:
        settings?.localization?.timezone || tenantRegionConfig?.defaultTimezone || "Africa/Johannesburg",
      supported_currencies:
        settings?.localization?.supported_currencies ||
        [tenantRegionConfig?.defaultCurrency || LAST_RESORT_CURRENCY, "USD", "EUR"],
      supported_languages: supportedLanguages,
      languages_meta: languages_meta.length ? languages_meta : undefined,
      currency_info: currencyInfo || {
        code: effectiveCurrency,
        symbol: currencyInfo?.symbol || undefined,
        name: currencyInfo?.name || undefined,
        decimal_places: currencyInfo?.decimal_places ?? 2,
      },
    };

    return NextResponse.json({
      data: response,
      error: null,
    });
  } catch (error: unknown) {
    console.error("Unexpected error in /api/public/platform-settings:", error);
    let fallbackCurrency: string = LAST_RESORT_CURRENCY;
    try {
      const tid = await resolveTenantIdWithZaFallback(request);
      const tr = await getTenantRegionConfig(tid);
      fallbackCurrency = tr?.defaultCurrency ?? LAST_RESORT_CURRENCY;
    } catch (tenantErr) {
      console.warn(
        "Tenant resolution failed in /api/public/platform-settings error path (fallback currency):",
        tenantErr,
      );
    }
    return NextResponse.json(
      {
        data: {
          default_currency: fallbackCurrency,
          default_language: "en",
          timezone: "Africa/Johannesburg",
          supported_currencies: [fallbackCurrency, "USD", "EUR"],
          supported_languages: [...DEFAULT_SUPPORTED_LANGUAGE_CODES],
          languages_meta: undefined,
          currency_info: {
            code: fallbackCurrency,
            symbol: undefined,
            name: undefined,
            decimal_places: 2,
          },
        },
        error: null,
      },
      { status: 200 } // Return defaults even on error
    );
  }
}
