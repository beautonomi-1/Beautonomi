import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAdminSection, handleApiError  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PLATFORM_CONFIG } from "@/lib/admin-sections";
import { writeAuditLog } from "@/lib/audit/audit";

// @admin-global Superadmin feature flag registry: rows include global defaults and per-tenant overrides; list endpoints intentionally return all.

/**
 * GET /api/admin/feature-flags
 * Get all feature flags (superadmin only). Returns { data, error }.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_PLATFORM_CONFIG, request);
    const supabase = getSupabaseAdmin();

    const { data: featureFlags, error } = await supabase
      .from('feature_flags')
      .select('*')
      .order('category', { ascending: true })
      .order('feature_name', { ascending: true });

    if (error) {
      return NextResponse.json(
        { data: null, error: { message: 'Failed to fetch feature flags', code: 'FETCH_ERROR' } },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: featureFlags ?? [], error: null });
  } catch (error) {
    return handleApiError(error, "Failed to fetch feature flags");
  }
}

/**
 * POST /api/admin/feature-flags
 * Create a new feature flag (superadmin only)
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_PLATFORM_CONFIG, request);
    const supabase = getSupabaseAdmin();

    const body = await request.json();
    const { feature_key, feature_name, description, enabled, category, metadata, tenant_id } = body;

    if (!feature_key || !feature_name) {
      return NextResponse.json(
        { data: null, error: { message: 'feature_key and feature_name are required', code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }

    const tenantId =
      tenant_id === null || tenant_id === undefined || tenant_id === ""
        ? null
        : typeof tenant_id === "string" && /^[0-9a-f-]{36}$/i.test(tenant_id)
          ? tenant_id
          : null;

    if (tenant_id != null && tenant_id !== "" && !tenantId) {
      return NextResponse.json(
        { data: null, error: { message: "tenant_id must be a valid UUID when provided", code: "VALIDATION_ERROR" } },
        { status: 400 }
      );
    }

    const { data: featureFlag, error } = await supabase
      .from('feature_flags')
      .insert({
        feature_key,
        feature_name,
        description,
        enabled: enabled ?? false,
        category: category ?? null,
        metadata: metadata ?? {},
        tenant_id: tenantId,
        created_by: user.id,
        updated_by: user.id,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { data: null, error: { message: error.message || 'Failed to create feature flag', code: 'CREATE_ERROR' } },
        { status: 500 }
      );
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: "superadmin",
      action: "admin.feature_flag.create",
      entity_type: "feature_flag",
      entity_id: featureFlag.id,
      metadata: { feature_key, enabled: enabled ?? false, tenant_id: tenantId },
    });

    return NextResponse.json({ data: featureFlag, error: null }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Failed to create feature flag");
  }
}
