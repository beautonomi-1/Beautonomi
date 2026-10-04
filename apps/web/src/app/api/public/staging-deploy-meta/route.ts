import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getTenantDomainEnvironment } from "@/lib/tenant/tenant-domain-environment";
import { resolveTenantFromRequest } from "@/lib/tenant/resolve-tenant-from-db";

export const dynamic = "force-dynamic";

function supabaseRefFromUrl(url: string | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    const host = new URL(url.trim()).hostname;
    const ref = host.split(".")[0];
    return ref || null;
  } catch {
    return null;
  }
}

function jwtPayload(apiKey: string | undefined): { ref: string | null; role: string | null } {
  if (!apiKey?.trim()) return { ref: null, role: null };
  try {
    const segment = apiKey.split(".")[1];
    if (!segment) return { ref: null, role: null };
    const json = Buffer.from(segment.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const payload = JSON.parse(json) as { ref?: string; project_ref?: string; role?: string };
    return {
      ref: payload.ref ?? payload.project_ref ?? null,
      role: typeof payload.role === "string" ? payload.role : null,
    };
  } catch {
    return { ref: null, role: null };
  }
}

function jwtProjectRef(apiKey: string | undefined): string | null {
  return jwtPayload(apiKey).ref;
}

function requestHost(request: NextRequest): string | null {
  const raw = (request.headers.get("x-forwarded-host") || request.headers.get("host") || "").trim();
  if (!raw) return null;
  return raw.split(":")[0]!.toLowerCase();
}

function isStagingHost(host: string | null): boolean {
  if (!host) return false;
  return host === "staging.beautonomi.com" || host.endsWith(".staging.beautonomi.com") || host.includes("staging.beautonomi");
}

/**
 * GET /api/public/staging-deploy-meta
 * Non-secret Preview/staging diagnostics (hostname-gated). Use in browser DevTools when debugging tenant/auth.
 */
export async function GET(request: NextRequest) {
  const host = requestHost(request);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim().toLowerCase() ?? "";
  const vercelEnv = process.env.VERCEL_ENV ?? null;
  const allowed =
    isStagingHost(host) ||
    vercelEnv === "preview" ||
    appUrl.includes("staging.beautonomi");

  if (!allowed) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const urlRef = supabaseRefFromUrl(supabaseUrl);
  const anonJwt = jwtPayload(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const serviceJwt = jwtPayload(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const anonRef = anonJwt.ref;
  const serviceRef = serviceJwt.ref;
  const tenantDomainEnv = getTenantDomainEnvironment();

  let tenant_slug: string | null = null;
  let tenant_resolution: "ok" | "missing" | "error" = "missing";
  try {
    const row = await resolveTenantFromRequest(request);
    if (row?.slug) {
      tenant_slug = row.slug;
      tenant_resolution = "ok";
    }
  } catch {
    tenant_resolution = "error";
  }

  let tenant_domains_probe: {
    row_count: number;
    postgrest_error: string | null;
    tenant_id: string | null;
  } = { row_count: 0, postgrest_error: null, tenant_id: null };
  if (host) {
    try {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from("tenant_domains")
        .select("tenant_id")
        .eq("hostname", host)
        .eq("environment", tenantDomainEnv)
        .eq("is_active", true);
      if (error) {
        tenant_domains_probe = { row_count: 0, postgrest_error: error.message, tenant_id: null };
      } else {
        const rows = data ?? [];
        tenant_domains_probe = {
          row_count: rows.length,
          postgrest_error: rows.length > 1 ? "PGRST116: multiple rows (maybeSingle would fail)" : null,
          tenant_id: rows.length === 1 ? (rows[0]!.tenant_id as string) : null,
        };
      }
    } catch (err) {
      tenant_domains_probe = {
        row_count: 0,
        postgrest_error: err instanceof Error ? err.message : "admin_client_error",
        tenant_id: null,
      };
    }
  }

  const keys_aligned =
    Boolean(urlRef && anonRef && serviceRef) &&
    urlRef === anonRef &&
    urlRef === serviceRef;

  const hints: string[] = [];
  if (vercelEnv === "production" && tenantDomainEnv === "production" && isStagingHost(host)) {
    hints.push(
      "VERCEL_ENV is production on a staging host — tenant_domains row is likely preview-only. Assign staging.beautonomi.com to the Preview environment in Vercel Domains, or set TENANT_DOMAIN_ENV=preview and redeploy.",
    );
  }
  if (!keys_aligned) {
    hints.push(
      "Supabase URL and JWT refs mismatch — set Preview NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY from the same project (byfzhyqvtbasxptxdupf), then redeploy.",
    );
  }
  if (serviceJwt.role && serviceJwt.role !== "service_role") {
    hints.push(
      `SUPABASE_SERVICE_ROLE_KEY JWT role is "${serviceJwt.role}" (expected service_role). Tenant lookup uses admin client — anon key in this slot causes tenant_resolution missing.`,
    );
  }
  if (anonJwt.role && anonJwt.role !== "anon") {
    hints.push(`NEXT_PUBLIC_SUPABASE_ANON_KEY JWT role is "${anonJwt.role}" (expected anon).`);
  }
  if (tenant_resolution !== "ok" && process.env.STRICT_TENANT_HOST_RESOLUTION === "true") {
    hints.push("Strict tenant resolution is on and host→tenant lookup failed (503 on /api/public/home).");
  }
  if (tenant_resolution !== "ok" && tenantDomainEnv === "staging" && isStagingHost(host)) {
    hints.push(
      "TENANT_DOMAIN_ENV=staging but staging hostnames in DB use environment=preview (migration 970). Set TENANT_DOMAIN_ENV=preview on Vercel Preview and redeploy.",
    );
  }
  if (
    tenant_resolution !== "ok" &&
    tenant_domains_probe.row_count === 0 &&
    !tenant_domains_probe.postgrest_error &&
    serviceJwt.role === "anon"
  ) {
    hints.push(
      "/api/health can still pass: anon JWT reads platform_settings but not tenant_domains. Set Preview SUPABASE_SERVICE_ROLE_KEY to the legacy service_role secret (not anon), then redeploy.",
    );
  }
  if (tenant_resolution !== "ok" && tenant_domains_probe.row_count === 0 && !tenant_domains_probe.postgrest_error) {
    hints.push(
      "Admin query returned 0 tenant_domains rows for this host+environment (wrong Supabase project, RLS-blocked JWT, or missing row). Compare with SQL on byfzhyqvtbasxptxdupf.",
    );
  }

  return NextResponse.json(
    {
      host,
      vercel_env: vercelEnv,
      tenant_domain_env: tenantDomainEnv,
      strict_tenant_host_resolution: process.env.STRICT_TENANT_HOST_RESOLUTION === "true",
      tenant_domain_fallback_to_production: process.env.TENANT_DOMAIN_FALLBACK_TO_PRODUCTION !== "false",
      next_public_app_url: process.env.NEXT_PUBLIC_APP_URL ?? null,
      supabase_url_ref: urlRef,
      supabase_anon_jwt_ref: anonRef,
      supabase_anon_jwt_role: anonJwt.role,
      supabase_service_role_jwt_ref: serviceRef,
      supabase_service_role_jwt_role: serviceJwt.role,
      supabase_keys_aligned: keys_aligned,
      has_service_role_key: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
      tenant_resolution,
      tenant_slug,
      tenant_domains_probe,
      hints,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
