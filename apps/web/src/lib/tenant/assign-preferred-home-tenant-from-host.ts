import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveTenantFromRequest } from "@/lib/tenant/resolve-tenant-from-db";

const LOCAL_DEV_HOSTNAMES = new Set(["localhost", "127.0.0.1"]);

function requestHostname(request: Request): string {
  const raw = (request.headers.get("x-forwarded-host") || request.headers.get("host") || "").trim();
  return raw.split(":")[0]!.toLowerCase();
}

function isLocalDevHost(request: Request): boolean {
  return LOCAL_DEV_HOSTNAMES.has(requestHostname(request));
}

async function resolveDevDefaultTenantId(): Promise<string | null> {
  const slug = process.env.DEV_DEFAULT_TENANT_SLUG?.trim();
  if (!slug || process.env.NODE_ENV === "production") return null;

  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("tenants")
    .select("id, slug")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (!data?.id || (data as { slug?: string }).slug === "global") return null;
  return data.id as string;
}

/**
 * Resolve the transactional tenant for signup from Host → tenant_domains.
 * Does not fall back to legacy `za` (global entry / unmapped hosts stay unset).
 * Localhost may use DEV_DEFAULT_TENANT_SLUG when configured (non-production).
 */
export async function resolveSignupHostTenantId(request: Request): Promise<string | null> {
  const row = await resolveTenantFromRequest(request);
  if (row?.id && row.is_active && row.slug !== "global") {
    return row.id;
  }

  if (isLocalDevHost(request)) {
    return resolveDevDefaultTenantId();
  }

  return null;
}

/**
 * Set users.preferred_home_tenant_id from the signup/request host when still null.
 * Idempotent — never overwrites an existing preference or explicit market tenant tie.
 */
export async function assignPreferredHomeTenantFromHostIfUnset(
  supabase: SupabaseClient,
  userId: string,
  request: Request,
  explicitTenantId?: string | null,
): Promise<string | null> {
  const { data: row, error: readError } = await supabase
    .from("users")
    .select("preferred_home_tenant_id")
    .eq("id", userId)
    .maybeSingle();

  if (readError) {
    console.warn("[assignPreferredHomeTenantFromHostIfUnset] read failed:", readError);
    return null;
  }

  const existing = (row as { preferred_home_tenant_id?: string | null } | null)?.preferred_home_tenant_id;
  if (existing) return existing;

  let tenantId = explicitTenantId ?? (await resolveSignupHostTenantId(request));
  if (!tenantId) return null;

  const { data: tenantRow, error: tenantError } = await supabase
    .from("tenants")
    .select("id, slug")
    .eq("id", tenantId)
    .eq("is_active", true)
    .maybeSingle();

  if (tenantError || !tenantRow?.id || (tenantRow as { slug?: string }).slug === "global") {
    return null;
  }

  const { error: updateError } = await supabase
    .from("users")
    .update({ preferred_home_tenant_id: tenantId })
    .eq("id", userId)
    .is("preferred_home_tenant_id", null);

  if (updateError) {
    console.warn("[assignPreferredHomeTenantFromHostIfUnset] update failed:", updateError);
    return null;
  }

  return tenantId;
}

/** Service-role bootstrap for auth/session entry points (portal, role, OAuth callback, …). */
export async function bootstrapPreferredHomeTenantForAuthedUser(
  userId: string,
  request: Request,
  explicitTenantId?: string | null,
): Promise<string | null> {
  return assignPreferredHomeTenantFromHostIfUnset(
    getSupabaseAdmin(),
    userId,
    request,
    explicitTenantId ?? null,
  );
}
