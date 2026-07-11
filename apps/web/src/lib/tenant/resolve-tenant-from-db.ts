import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getTenantDomainEnvironment,
  tenantDomainFallbackToProductionEnabled,
  type TenantDomainEnvironment,
} from "@/lib/tenant/tenant-domain-environment";

/** Hostnames where optional DEV_DEFAULT_TENANT_SLUG applies (no port; see normalizeRequestHost). */
const LOCAL_DEV_HOSTNAMES = new Set(["localhost", "127.0.0.1"]);

export type TenantRow = {
  id: string;
  slug: string;
  name: string;
  region_code: string;
  lifecycle: string;
  default_currency: string;
  default_language: string;
  default_timezone: string;
  is_active: boolean;
};

function normalizeRequestHost(request: Request): string | null {
  const h = request.headers;
  const raw = (h.get("x-forwarded-host") || h.get("host") || "").trim();
  if (!raw) return null;
  return raw.split(":")[0]!.toLowerCase();
}

function isLocalDevHostname(host: string | null): boolean {
  return host != null && LOCAL_DEV_HOSTNAMES.has(host);
}

function strictTenantResolutionEnabled(): boolean {
  return process.env.STRICT_TENANT_HOST_RESOLUTION === "true";
}

/** Structured log for dashboards / log drains (disable with LOG_TENANT_RESOLUTION_FALLBACK=false). */
let tenantResolutionFallbackCount = 0;

function logTenantResolutionFallback(event: Record<string, unknown>): void {
  if (process.env.LOG_TENANT_RESOLUTION_FALLBACK === "false") return;
  tenantResolutionFallbackCount += 1;
  try {
    console.warn(
      JSON.stringify({
        metric: "tenant_resolution_fallback",
        count: tenantResolutionFallbackCount,
        ts: new Date().toISOString(),
        ...event,
      }),
    );
  } catch {
    // ignore
  }
}

async function selectTenantIdForHostAndEnvironment(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  host: string,
  environment: TenantDomainEnvironment,
): Promise<string | null> {
  const { data: domainRow, error: dErr } = await supabase
    .from("tenant_domains")
    .select("tenant_id")
    .eq("hostname", host)
    .eq("environment", environment)
    .eq("is_active", true)
    .maybeSingle();
  if (dErr || !domainRow?.tenant_id) return null;
  return domainRow.tenant_id as string;
}

/**
 * When DEV_DEFAULT_TENANT_SLUG is set, NODE_ENV is not production, and Host is localhost/127.0.0.1,
 * resolve that tenant for public API routes. Fixes empty /api/public/home when tenant_domains points
 * at `za` but local seed providers live under another slug.
 */
async function tryResolveDevDefaultTenantId(): Promise<string | null> {
  const slug = process.env.DEV_DEFAULT_TENANT_SLUG?.trim();
  if (!slug || process.env.NODE_ENV === "production") return null;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tenants")
    .select("id")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  if (error || !data?.id) return null;
  return data.id as string;
}

/**
 * Resolve tenant by Host → tenant_domains (trusted headers per §7.1). Returns null if unmapped (fail closed for writes).
 * Matches `tenant_domains.environment` to the current deploy (see `getTenantDomainEnvironment`).
 * When no row exists for that environment, optionally retries `production` (TENANT_DOMAIN_FALLBACK_TO_PRODUCTION).
 */
export async function resolveTenantFromRequest(request: Request): Promise<TenantRow | null> {
  const host = normalizeRequestHost(request);
  if (!host) return null;
  try {
    const supabase = getSupabaseAdmin();
    const env = getTenantDomainEnvironment();
    let tenantId: string | null = await selectTenantIdForHostAndEnvironment(supabase, host, env);

    if (!tenantId && env !== "production" && tenantDomainFallbackToProductionEnabled()) {
      tenantId = await selectTenantIdForHostAndEnvironment(supabase, host, "production");
      if (tenantId && !isLocalDevHostname(host)) {
        logTenantResolutionFallback({
          reason: "environment_fallback_to_production",
          host,
          requested_environment: env,
        });
      }
    }

    if (!tenantId) return null;

    const { data: tenant, error: tErr } = await supabase
      .from("tenants")
      .select("id, slug, name, region_code, lifecycle, default_currency, default_language, default_timezone, is_active")
      .eq("id", tenantId)
      .eq("is_active", true)
      .maybeSingle();
    if (tErr || !tenant) return null;
    return tenant as TenantRow;
  } catch {
    return null;
  }
}

/**
 * Resolves active tenant id from Host → `tenant_domains`, then (unless
 * `STRICT_TENANT_HOST_RESOLUTION=true`) falls back to the legacy `za` tenant row.
 *
 * **Strict mode:** unmapped host throws — enable in prod when every customer host exists in
 * `tenant_domains` (`REGION_ROLLOUT_CHECKLIST.md`).
 *
 * **Call sites:** many `/api/*` routes use this for tenant-scoped reads and writes. Money and
 * mutating paths must still validate `resource.tenant_id` / provider membership against the
 * resolved id (NN-8: fallback must not bypass per-booking or per-provider checks). To list usages:
 * `rg resolveTenantIdWithZaFallback apps/web/src --glob "*.ts"`.
 */
export async function resolveTenantIdWithZaFallback(request: Request): Promise<string> {
  const host = normalizeRequestHost(request);
  if (isLocalDevHostname(host)) {
    try {
      const devId = await tryResolveDevDefaultTenantId();
      if (devId) return devId;
    } catch {
      // Missing service role or DB error — fall through to Host / za resolution
    }
  }

  const row = await resolveTenantFromRequest(request);
  if (row?.id) return row.id;

  // Global-ready mode: unknown/unmapped production hosts must fail closed.
  if (strictTenantResolutionEnabled()) {
    throw new Error("Tenant host mapping required");
  }

  logTenantResolutionFallback({
    reason: "za_tenant_fallback",
    host: host ?? null,
    tenant_domain_environment: getTenantDomainEnvironment(),
  });

  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from("tenants").select("id").eq("slug", "za").maybeSingle();
  if (data?.id) return data.id as string;
  throw new Error("No tenant resolved and no default za tenant row");
}
