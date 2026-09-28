import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getTenantDomainEnvironment } from "@/lib/tenant/tenant-domain-environment";

export function getRequestOrigin(request: NextRequest): string {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const proto = forwardedProto === "http" ? "http" : "https";
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = (forwardedHost || request.headers.get("host") || "").trim();

  if (host) {
    return `${proto}://${host}`;
  }

  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "https://www.beautonomi.com"
  );
}

export async function resolvePublicBookingOrigin(
  request: NextRequest,
  supabase: SupabaseClient,
  tenantId: string | null | undefined,
): Promise<string> {
  let baseUrl = getRequestOrigin(request);

  if (tenantId) {
    const env = getTenantDomainEnvironment();
    let domainRow: { hostname?: string } | null = null;

    const { data: envDomain } = await supabase
      .from("tenant_domains")
      .select("hostname")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .eq("is_primary", true)
      .eq("environment", env)
      .maybeSingle();
    domainRow = envDomain as { hostname?: string } | null;

    if (!domainRow?.hostname && env !== "production") {
      const { data: prodDomain } = await supabase
        .from("tenant_domains")
        .select("hostname")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .eq("is_primary", true)
        .eq("environment", "production")
        .maybeSingle();
      domainRow = prodDomain as { hostname?: string } | null;
    }

    if (domainRow?.hostname) {
      baseUrl = `https://${domainRow.hostname}`;
    }
  }

  return baseUrl.replace(/\/$/, "");
}
