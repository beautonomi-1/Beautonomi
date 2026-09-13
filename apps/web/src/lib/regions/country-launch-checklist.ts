import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getPrimaryOnlinePaymentGatewayForRegion } from "@/lib/regions/payment-gateways";
import { checkReportingCurrencyFreshness } from "@/lib/fx/assert-reporting-currency-ready";

export type CountryLaunchCheckItem = {
  id: string;
  label: string;
  ok: boolean;
  detail?: string;
  href?: string;
};

export type CountryLaunchValidationResult = {
  tenantId: string;
  regionCode: string;
  ready: boolean;
  items: CountryLaunchCheckItem[];
};

type TenantRow = {
  id: string;
  slug: string;
  region_code: string;
  default_currency: string;
  default_language: string;
  is_active: boolean;
};

/**
 * Automated pre-launch validation for a tenant+region pair.
 * Used by superadmin before enabling a country feature flag.
 */
export async function validateCountryLaunchReadiness(
  tenantId: string,
): Promise<CountryLaunchValidationResult> {
  const supabase = getSupabaseAdmin();
  const items: CountryLaunchCheckItem[] = [];

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, slug, region_code, default_currency, default_language, is_active")
    .eq("id", tenantId)
    .maybeSingle();

  const t = tenant as TenantRow | null;
  if (!t?.id) {
    return {
      tenantId,
      regionCode: "",
      ready: false,
      items: [{ id: "tenant", label: "Tenant exists", ok: false, detail: "Not found" }],
    };
  }

  items.push({
    id: "tenant_active",
    label: "Tenant active",
    ok: t.is_active === true,
  });

  const { data: region } = await supabase
    .from("regions")
    .select("id, code, default_currency, default_language, supported_languages, is_active")
    .ilike("code", t.region_code)
    .maybeSingle();

  items.push({
    id: "region",
    label: "Region row linked by region_code",
    ok: Boolean(region?.id),
    detail: region?.code,
  });

  items.push({
    id: "currency_match",
    label: "Tenant currency matches region default_currency",
    ok: Boolean(region && region.default_currency === t.default_currency),
    detail: `${t.default_currency} vs ${region?.default_currency ?? "?"}`,
  });

  const { data: domains } = await supabase
    .from("tenant_domains")
    .select("hostname")
    .eq("tenant_id", tenantId)
    .eq("environment", "production")
    .eq("is_active", true);

  items.push({
    id: "domains",
    label: "Production tenant_domains configured",
    ok: (domains?.length ?? 0) > 0,
    detail: `${domains?.length ?? 0} host(s)`,
  });

  let gatewayOk = false;
  let gatewayDetail = "none";
  if (region?.id) {
    const gateway = await getPrimaryOnlinePaymentGatewayForRegion(region.id as string);
    gatewayOk = Boolean(gateway?.gateway);
    gatewayDetail = gateway?.gateway ?? "missing";
    const settlementModel =
      (gateway?.config as { settlement_model?: string } | null)?.settlement_model ?? "unset";
    items.push({
      id: "gateway",
      label: "Primary online payment gateway",
      ok: gatewayOk,
      detail: `${gatewayDetail}; settlement_model=${settlementModel}`,
    });

    const secretKeys =
      gateway?.gateway === "stripe"
        ? ["stripe_secret_key", "stripe_webhook_secret"]
        : gateway?.gateway === "paystack"
          ? ["paystack_secret_key"]
          : [];

    for (const key of secretKeys) {
      const { data: secret } = await supabase
        .from("region_secrets")
        .select("id")
        .eq("region_id", region.id)
        .eq("key", key)
        .maybeSingle();
      items.push({
        id: `secret_${key}`,
        label: `Region secret: ${key}`,
        ok: Boolean(secret?.id),
      });
    }
  }

  const { data: currencyRow } = await supabase
    .from("currencies")
    .select("code")
    .eq("code", t.default_currency)
    .maybeSingle();

  items.push({
    id: "currency_catalog",
    label: "Currency in currencies reference table",
    ok: Boolean(currencyRow?.code),
  });

  const supportedLangs = Array.isArray((region as { supported_languages?: string[] | null } | null)?.supported_languages)
    ? ((region as { supported_languages: string[] }).supported_languages ?? [])
    : [];
  items.push({
    id: "supported_languages",
    label: "Region supported_languages configured",
    ok: supportedLangs.length > 0,
    detail: supportedLangs.length ? supportedLangs.join(", ") : "empty",
  });

  const { data: languagesFlag } = await supabase
    .from("feature_flags")
    .select("enabled")
    .eq("feature_key", "languages.enabled")
    .maybeSingle();
  items.push({
    id: "languages_enabled_flag",
    label: "languages.enabled feature flag",
    ok: languagesFlag?.enabled === true,
  });

  if (supportedLangs.some((l) => l.toLowerCase().startsWith("ar"))) {
    const { count: arTemplates } = await supabase
      .from("notification_template_translations")
      .select("id", { count: "exact", head: true })
      .eq("language_code", "ar")
      .eq("is_active", true);
    items.push({
      id: "notification_ar_templates",
      label: "Arabic notification template translations seeded",
      ok: (arTemplates ?? 0) >= 3,
      detail: `${arTemplates ?? 0} row(s)`,
    });
  }

  if (t.default_currency && t.default_currency.toUpperCase() !== "ZAR") {
    const fxCheck = await checkReportingCurrencyFreshness(t.default_currency);
    const fxDetail = fxCheck.ok
      ? `${t.default_currency}→ZAR (${fxCheck.rateDate ?? "?"}, ${fxCheck.source ?? "?"})`
      : `${fxCheck.ok === false ? fxCheck.message : "FX not ready"} — fix on Finance → FX rates`;
    items.push({
      id: "fx_reporting_rate",
      label: "FX reference rate for tenant currency → ZAR reporting",
      ok: fxCheck.ok,
      href: "/admin/fx-rates",
      detail: fxDetail,
    });
  }

  const ready = items.every((i) => i.ok);
  return {
    tenantId,
    regionCode: t.region_code,
    ready,
    items,
  };
}
