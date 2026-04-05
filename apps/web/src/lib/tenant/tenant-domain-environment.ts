/**
 * Which `tenant_domains.environment` value the resolver should match for this process.
 * Aligns with Vercel (`VERCEL_ENV`) and optional override (`TENANT_DOMAIN_ENV`).
 */
export type TenantDomainEnvironment = "production" | "preview" | "development" | "staging";

/**
 * Resolve the active tenant_domains.environment for Host → tenant lookups.
 *
 * - `TENANT_DOMAIN_ENV` wins when set (e.g. `staging`, `preview`).
 * - Else `VERCEL_ENV`: production → production, preview → preview, development → development.
 * - Else `NODE_ENV === 'production'` → production; otherwise development (local Next).
 */
export function getTenantDomainEnvironment(): TenantDomainEnvironment {
  const explicit = process.env.TENANT_DOMAIN_ENV?.trim().toLowerCase();
  if (explicit === "production" || explicit === "preview" || explicit === "development" || explicit === "staging") {
    return explicit;
  }

  const vercel = process.env.VERCEL_ENV;
  if (vercel === "production") return "production";
  if (vercel === "preview") return "preview";
  if (vercel === "development") return "development";

  return process.env.NODE_ENV === "production" ? "production" : "development";
}

/**
 * When true (default), if no row exists for (hostname, env), retry with `production`.
 * Disable in environments where preview hosts must never inherit production mappings.
 */
export function tenantDomainFallbackToProductionEnabled(): boolean {
  return process.env.TENANT_DOMAIN_FALLBACK_TO_PRODUCTION !== "false";
}

/** For admin API: default production; invalid values return null. */
export function parseTenantDomainEnvironmentInput(raw: unknown): TenantDomainEnvironment | null {
  if (raw === undefined || raw === null || raw === "") return "production";
  const s = String(raw).trim().toLowerCase();
  if (s === "production" || s === "preview" || s === "development" || s === "staging") {
    return s;
  }
  return null;
}
