import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireRoleInApi } from '@/lib/supabase/api-helpers';
import { writeAuditLog } from "@/lib/audit/audit";
import { writeConfigChangeLog } from "@/lib/config/config-change-log";

/**
 * GET /api/admin/feature-flags/[id]
 * Get a specific feature flag (superadmin only)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleInApi(['superadmin'], request);
    const supabase = getSupabaseAdmin();

    const { id } = await params;

    // Fetch feature flag
    const { data: featureFlag, error } = await supabase
      .from('feature_flags')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching feature flag:', error);
      return NextResponse.json(
        { error: 'Feature flag not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ featureFlag }, { status: 200 });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/feature-flags/[id]
 * Update a feature flag (superadmin only)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['superadmin'], request);
    const supabase = getSupabaseAdmin();

    const { id } = await params;
    const body = await request.json();
    const {
      feature_name,
      description,
      enabled,
      category,
      metadata,
      rollout_percent,
      platforms_allowed,
      roles_allowed,
      min_app_version,
      environments_allowed,
    } = body;

    const { data: before } = await supabase
      .from("feature_flags")
      .select("feature_key, enabled, rollout_percent, platforms_allowed, roles_allowed, min_app_version, environments_allowed")
      .eq("id", id)
      .single();

    const updates: Record<string, unknown> = {
      updated_by: user.id,
    };

    if (feature_name !== undefined) updates.feature_name = feature_name;
    if (description !== undefined) updates.description = description;
    if (enabled !== undefined) updates.enabled = enabled;
    if (category !== undefined) updates.category = category;
    if (metadata !== undefined) updates.metadata = metadata;
    if (rollout_percent !== undefined) updates.rollout_percent = rollout_percent;
    if (platforms_allowed !== undefined) updates.platforms_allowed = platforms_allowed;
    if (roles_allowed !== undefined) updates.roles_allowed = roles_allowed;
    if (min_app_version !== undefined) updates.min_app_version = min_app_version;
    if (environments_allowed !== undefined) updates.environments_allowed = environments_allowed;

    const { data: featureFlag, error } = await supabase
      .from('feature_flags')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating feature flag:', error);
      return NextResponse.json(
        { error: { message: error.message || 'Failed to update feature flag', code: 'UPDATE_ERROR' } },
        { status: 500 }
      );
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: "superadmin",
      action: "admin.feature_flag.update",
      entity_type: "feature_flag",
      entity_id: id,
      metadata: { enabled, feature_name },
    });

    const after = featureFlag
      ? {
          feature_key: featureFlag.feature_key,
          enabled: featureFlag.enabled,
          rollout_percent: featureFlag.rollout_percent,
          platforms_allowed: featureFlag.platforms_allowed,
          roles_allowed: featureFlag.roles_allowed,
          min_app_version: featureFlag.min_app_version,
          environments_allowed: featureFlag.environments_allowed,
        }
      : null;
    await writeConfigChangeLog({
      changedBy: user.id,
      area: "flags",
      recordKey: (before as { feature_key?: string })?.feature_key ?? id,
      before: before as Record<string, unknown> | null,
      after: after as Record<string, unknown> | null,
    });

    return NextResponse.json({ featureFlag }, { status: 200 });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/feature-flags/[id]
 * Delete a feature flag (superadmin only)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['superadmin'], request);
    const supabase = getSupabaseAdmin();

    const { id } = await params;

    // Delete feature flag
    const { error } = await supabase
      .from('feature_flags')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting feature flag:', error);
      return NextResponse.json(
        { error: 'Failed to delete feature flag' },
        { status: 500 }
      );
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: "superadmin",
      action: "admin.feature_flag.delete",
      entity_type: "feature_flag",
      entity_id: id,
      metadata: {},
    });

    return NextResponse.json({ message: 'Feature flag deleted' }, { status: 200 });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
