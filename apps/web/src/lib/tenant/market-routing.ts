import { getSupabaseAdmin } from "@/lib/supabase/admin";

const ISO2 = /^[A-Z]{2}$/;

function normalizeHost(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0] ?? "";
}

function currentHostFromRequest(request: Request): string {
  return normalizeHost(request.headers.get("x-forwarded-host") || request.headers.get("host"));
}

function globalEntryHost(): string {
  return normalizeHost(process.env.NEXT_PUBLIC_GLOBAL_ENTRY_HOST) || "beautonomi.com";
}

function defaultMarketHost(): string {
  return normalizeHost(process.env.NEXT_PUBLIC_DEFAULT_MARKET_HOST) || "beautonomi.co.za";
}

function autoSwitchEnabled(): boolean {
  const raw = (process.env.MARKET_AUTO_SWITCH_ENABLED ?? "true").trim().toLowerCase();
  return raw !== "false" && raw !== "0" && raw !== "off" && raw !== "no";
}

function autoSwitchAllowedCountries(): Set<string> {
  const raw = (process.env.MARKET_AUTO_SWITCH_ALLOWED_COUNTRIES ?? "").trim();
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((v) => v.trim().toUpperCase())
      .filter((v) => ISO2.test(v)),
  );
}

function hostIsGlobalEntry(host: string): boolean {
  const global = globalEntryHost();
  return !!host && (host === global || host === `www.${global}`);
}

function fallbackHostFromEnv(countryCode: string): string | null {
  const raw = process.env.TENANT_HOST_COUNTRY_MAP?.trim();
  if (!raw) return null;
  try {
    const map = JSON.parse(raw) as Record<string, string>;
    for (const [host, code] of Object.entries(map)) {
      if (String(code).trim().toUpperCase() === countryCode) {
        const normalized = normalizeHost(host);
        if (normalized) return normalized;
      }
    }
  } catch {
    return null;
  }
  return null;
}

async function resolvePrimaryHostForCountry(countryCode: string): Promise<string | null> {
  if (!ISO2.test(countryCode)) return null;
  const supabase = getSupabaseAdmin();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id")
    .eq("region_code", countryCode)
    .eq("is_active", true)
    .eq("lifecycle", "active")
    .limit(1)
    .maybeSingle();

  const tenantId = (tenant as { id?: string } | null)?.id;
  if (!tenantId) return fallbackHostFromEnv(countryCode);

  const { data: primaryDomain } = await supabase
    .from("tenant_domains")
    .select("hostname")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .eq("is_primary", true)
    .limit(1)
    .maybeSingle();

  const primary = normalizeHost((primaryDomain as { hostname?: string } | null)?.hostname);
  if (primary) return primary;

  const { data: anyDomain } = await supabase
    .from("tenant_domains")
    .select("hostname")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  const fallback = normalizeHost((anyDomain as { hostname?: string } | null)?.hostname);
  return fallback || fallbackHostFromEnv(countryCode);
}

async function resolveTenantIdByHost(host: string): Promise<string | null> {
  const normalized = normalizeHost(host);
  if (!normalized) return null;
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("tenant_domains")
    .select("tenant_id")
    .eq("hostname", normalized)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  return (data as { tenant_id?: string } | null)?.tenant_id ?? null;
}

export interface TenantRoutingDecision {
  currentHost: string;
  globalEntryHost: string;
  defaultMarketHost: string;
  defaultMarketTenantId: string | null;
  marketSource: "query" | "host" | "header_hint" | "geo_header" | "default" | "user_preference";
  confidence: "high" | "medium" | "low";
  recommendedHost: string | null;
  recommendedTenantId: string | null;
  autoSwitchEnabled: boolean;
  autoSwitchCountryAllowed: boolean;
  autoSwitchHost: string | null;
  shouldAutoSwitch: boolean;
}

export async function resolveTenantRoutingDecision(input: {
  request: Request;
  countryCode: string;
  marketSource: "query" | "host" | "header_hint" | "geo_header" | "default";
  availabilityStatus: "allowed" | "unsupported" | "restricted";
  preferredHomeTenantId?: string | null;
}): Promise<TenantRoutingDecision> {
  const currentHost = currentHostFromRequest(input.request);
  const globalHost = globalEntryHost();
  const defaultHost = defaultMarketHost();
  const onGlobalEntry = hostIsGlobalEntry(currentHost);
  let marketSource: TenantRoutingDecision["marketSource"] = input.marketSource;
  let recommendedHost = await resolvePrimaryHostForCountry(input.countryCode);
  let recommendedTenantId = recommendedHost ? await resolveTenantIdByHost(recommendedHost) : null;
  const defaultMarketTenantId = await resolveTenantIdByHost(defaultHost);
  if (input.preferredHomeTenantId) {
    const supabase = getSupabaseAdmin();
    const { data: preferredDomain } = await supabase
      .from("tenant_domains")
      .select("hostname")
      .eq("tenant_id", input.preferredHomeTenantId)
      .eq("is_active", true)
      .eq("is_primary", true)
      .limit(1)
      .maybeSingle();
    const preferredHost = normalizeHost((preferredDomain as { hostname?: string } | null)?.hostname);
    if (preferredHost) {
      recommendedHost = preferredHost;
      recommendedTenantId = input.preferredHomeTenantId;
      marketSource = "user_preference";
    }
  }
  const confidence =
    marketSource === "query" || marketSource === "header_hint" || marketSource === "user_preference"
      ? "high"
      : marketSource === "geo_header"
        ? "medium"
        : "low";
  const enabled = autoSwitchEnabled();
  const allowedCountries = autoSwitchAllowedCountries();
  const countryAllowed =
    allowedCountries.size === 0 || allowedCountries.has(input.countryCode.trim().toUpperCase());

  const shouldAutoSwitch =
    enabled &&
    countryAllowed &&
    input.availabilityStatus === "allowed" &&
    onGlobalEntry &&
    marketSource !== "default" &&
    !!recommendedHost &&
    recommendedHost !== currentHost;

  return {
    currentHost,
    globalEntryHost: globalHost,
    defaultMarketHost: defaultHost,
    defaultMarketTenantId,
    marketSource,
    confidence,
    recommendedHost,
    recommendedTenantId,
    autoSwitchEnabled: enabled,
    autoSwitchCountryAllowed: countryAllowed,
    autoSwitchHost: shouldAutoSwitch ? recommendedHost : null,
    shouldAutoSwitch,
  };
}
