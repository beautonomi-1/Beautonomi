import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  forbiddenResponse,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PLATFORM_CONFIG } from "@/lib/admin-sections";
import { writeAuditLog } from "@/lib/audit/audit";
import { normalizeTenantHostname } from "@/lib/tenant/normalize-tenant-hostname";
import { parseTenantDomainEnvironmentInput } from "@/lib/tenant/tenant-domain-environment";

// @admin-global Superadmin-only registry: tenant_domains + tenants span all markets; not scoped by session Host tenant.

async function requireSuperadminPlatform(request: NextRequest) {
  const { user } = await requireAdminSection(ADMIN_SECTION_PLATFORM_CONFIG, request);
  if (user.role !== "superadmin") {
    return { user: null };
  }
  return { user };
}

/**
 * GET /api/admin/tenant-domains — list all domain mappings and tenants (superadmin only).
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireSuperadminPlatform(request);
    if (!user) return forbiddenResponse("Superadmin only");

    const supabase = getSupabaseAdmin();

    const [{ data: domains, error: dErr }, { data: tenants, error: tErr }] = await Promise.all([
      supabase
        .from("tenant_domains")
        .select("id, tenant_id, hostname, environment, is_legacy, is_primary, is_active, created_at")
        .order("hostname", { ascending: true }),
      supabase.from("tenants").select("id, slug, name, region_code, is_active").order("slug", { ascending: true }),
    ]);

    if (dErr) {
      return errorResponse(dErr.message || "Failed to load tenant domains", "FETCH_ERROR", 500);
    }
    if (tErr) {
      return errorResponse(tErr.message || "Failed to load tenants", "FETCH_ERROR", 500);
    }

    return successResponse({
      domains: domains ?? [],
      tenants: tenants ?? [],
    });
  } catch (error) {
    return handleApiError(error, "Failed to list tenant domains");
  }
}

/**
 * POST /api/admin/tenant-domains — add hostname → tenant (superadmin only).
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireSuperadminPlatform(request);
    if (!user) return forbiddenResponse("Superadmin only");

    const body = await request.json().catch(() => ({}));
    const tenantId = body.tenant_id as string | undefined;
    const isPrimary = Boolean(body.is_primary);
    const isActive = body.is_active !== false;
    const environment = parseTenantDomainEnvironmentInput(body.environment);
    if (environment === null) {
      return errorResponse(
        "environment must be production, preview, development, or staging",
        "VALIDATION_ERROR",
        400,
      );
    }
    const isLegacy = Boolean(body.is_legacy);

    const norm = normalizeTenantHostname(body.hostname ?? "");
    if (norm.ok === false) {
      return errorResponse(norm.error, "VALIDATION_ERROR", 400);
    }
    if (!tenantId) {
      return errorResponse("tenant_id is required", "VALIDATION_ERROR", 400);
    }

    const supabase = getSupabaseAdmin();

    const { data: tenant, error: tenantErr } = await supabase
      .from("tenants")
      .select("id, slug")
      .eq("id", tenantId)
      .maybeSingle();
    if (tenantErr || !tenant) {
      return errorResponse("Tenant not found", "NOT_FOUND", 404);
    }

    if (isPrimary) {
      await supabase.from("tenant_domains").update({ is_primary: false }).eq("tenant_id", tenantId);
    }

    const { data: row, error: insErr } = await supabase
      .from("tenant_domains")
      .insert({
        tenant_id: tenantId,
        hostname: norm.hostname,
        environment,
        is_legacy: isLegacy,
        is_primary: isPrimary,
        is_active: isActive,
      })
      .select("id, tenant_id, hostname, environment, is_legacy, is_primary, is_active, created_at")
      .single();

    if (insErr) {
      if (insErr.code === "23505") {
        return errorResponse(
          "That hostname and environment combination is already mapped",
          "DUPLICATE_HOSTNAME",
          409,
        );
      }
      return errorResponse(insErr.message || "Insert failed", "INSERT_ERROR", 500);
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "tenant_domain_create",
      entity_type: "tenant_domains",
      entity_id: row?.id ?? null,
      metadata: {
        hostname: norm.hostname,
        tenant_id: tenantId,
        environment,
        is_legacy: isLegacy,
        is_primary: isPrimary,
        is_active: isActive,
      },
    });

    return successResponse({ domain: row }, 201);
  } catch (error) {
    return handleApiError(error, "Failed to create tenant domain");
  }
}
