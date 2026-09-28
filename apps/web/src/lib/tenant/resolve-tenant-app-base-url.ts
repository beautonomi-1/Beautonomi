import type { SupabaseClient } from "@supabase/supabase-js";
import { getTenantDomainEnvironment } from "@/lib/tenant/tenant-domain-environment";

/**
 * Primary tenant hostname for invite links and emails (falls back to NEXT_PUBLIC_APP_URL).
 */
export async function resolveTenantAppBaseUrl(
  supabase: SupabaseClient,
  tenantId: string | null | undefined,
): Promise<string> {
  const fallback = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");

  if (!tenantId) return fallback || "";

  const env = getTenantDomainEnvironment();
  let hostname: string | undefined;

  const { data: envDomain } = await supabase
    .from("tenant_domains")
    .select("hostname")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .eq("is_primary", true)
    .eq("environment", env)
    .maybeSingle();
  hostname = (envDomain as { hostname?: string } | null)?.hostname;

  if (!hostname && env !== "production") {
    const { data: prodDomain } = await supabase
      .from("tenant_domains")
      .select("hostname")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .eq("is_primary", true)
      .eq("environment", "production")
      .maybeSingle();
    hostname = (prodDomain as { hostname?: string } | null)?.hostname;
  }

  if (hostname) return `https://${hostname}`.replace(/\/$/, "");
  return fallback || "";
}
