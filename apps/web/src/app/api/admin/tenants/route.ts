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

// @admin-global Superadmin-only: creates market tenants; not Host-session scoped.

async function requireSuperadminPlatform(request: NextRequest) {
  const { user } = await requireAdminSection(ADMIN_SECTION_PLATFORM_CONFIG, request);
  if (user.role !== "superadmin") {
    return { user: null };
  }
  return { user };
}

function normalizeSlug(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * GET /api/admin/tenants — list active tenants for superadmin scope picker (AdminShell / admin SPA).
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireSuperadminPlatform(request);
    if (!user) return forbiddenResponse("Superadmin only");
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("tenants")
      .select("id, slug, name, region_code, is_active")
      .eq("is_active", true)
      .order("slug", { ascending: true });
    if (error) {
      return errorResponse(error.message || "Failed to load tenants", "FETCH_ERROR", 500);
    }
    return successResponse(data ?? []);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/admin/tenants — create tenant + empty settings/secrets rows (superadmin only).
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireSuperadminPlatform(request);
    if (!user) return forbiddenResponse("Superadmin only");

    const body = await request.json().catch(() => ({}));
    const slug = normalizeSlug(body.slug ?? "");
    const name = String(body.name ?? "").trim();
    const regionCode = String(body.region_code ?? "").trim().toUpperCase();
    const defaultCurrency = String(body.default_currency ?? "").trim().toUpperCase();
    const defaultLanguage = String(body.default_language ?? "en").trim().toLowerCase();
    const defaultTimezone = String(body.default_timezone ?? "").trim();
    const lifecycle = body.lifecycle === "sandbox" || body.lifecycle === "suspended" ? body.lifecycle : "active";

    if (!slug || slug.length < 2) {
      return errorResponse("slug must be at least 2 characters (letters, numbers, hyphen, underscore)", "VALIDATION_ERROR", 400);
    }
    if (!name) {
      return errorResponse("name is required", "VALIDATION_ERROR", 400);
    }
    if (!regionCode || regionCode.length < 2) {
      return errorResponse("region_code is required (e.g. ZA, GB)", "VALIDATION_ERROR", 400);
    }
    if (!defaultCurrency || defaultCurrency.length !== 3) {
      return errorResponse("default_currency must be a 3-letter ISO code", "VALIDATION_ERROR", 400);
    }
    if (!defaultTimezone) {
      return errorResponse("default_timezone is required (e.g. Africa/Johannesburg)", "VALIDATION_ERROR", 400);
    }

    const supabase = getSupabaseAdmin();

    const { data: tenant, error: tErr } = await supabase
      .from("tenants")
      .insert({
        slug,
        name,
        region_code: regionCode,
        lifecycle,
        default_currency: defaultCurrency,
        default_language: defaultLanguage,
        default_timezone: defaultTimezone,
        is_active: true,
      })
      .select("id, slug, name, region_code, lifecycle, default_currency, default_language, default_timezone, is_active")
      .single();

    if (tErr) {
      if (tErr.code === "23505") {
        return errorResponse("That tenant slug already exists", "DUPLICATE_SLUG", 409);
      }
      return errorResponse(tErr.message || "Failed to create tenant", "INSERT_ERROR", 500);
    }

    if (!tenant?.id) {
      return errorResponse("Tenant insert returned no id", "INSERT_ERROR", 500);
    }

    const [{ error: sErr }, { error: secErr }] = await Promise.all([
      supabase.from("tenant_settings").insert({ tenant_id: tenant.id, settings: {}, version: 1, is_active: true }),
      supabase.from("tenant_secrets").insert({ tenant_id: tenant.id }),
    ]);

    if (sErr || secErr) {
      await supabase.from("tenants").delete().eq("id", tenant.id);
      return errorResponse(
        (sErr || secErr)?.message || "Failed to create tenant settings",
        "INSERT_ERROR",
        500,
      );
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "tenant_create",
      entity_type: "tenants",
      entity_id: tenant.id,
      metadata: { slug, name, region_code: regionCode },
    });

    return successResponse({ tenant }, 201);
  } catch (error) {
    return handleApiError(error, "Failed to create tenant");
  }
}
