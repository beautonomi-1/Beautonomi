import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireRoleInApi, handleApiError } from "@/lib/supabase/api-helpers";
import { writeAuditLog } from "@/lib/audit/audit";

/**
 * GET /api/admin/feature-flags
 * Get all feature flags (superadmin only). Returns { data, error }.
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(['superadmin'], request);
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
    const { user } = await requireRoleInApi(['superadmin'], request);
    const supabase = getSupabaseAdmin();

    const body = await request.json();
    const { feature_key, feature_name, description, enabled, category, metadata } = body;

    if (!feature_key || !feature_name) {
      return NextResponse.json(
        { data: null, error: { message: 'feature_key and feature_name are required', code: 'VALIDATION_ERROR' } },
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
      metadata: { feature_key, enabled: enabled ?? false },
    });

    return NextResponse.json({ data: featureFlag, error: null }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Failed to create feature flag");
  }
}
