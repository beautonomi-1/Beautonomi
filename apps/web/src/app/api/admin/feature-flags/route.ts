import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireRole } from '@/lib/supabase/auth-server';
import { writeAuditLog } from "@/lib/audit/audit";

/**
 * GET /api/admin/feature-flags
 * Get all feature flags (superadmin only)
 */
export async function GET(_request: NextRequest) {
  try {
    await requireRole(["superadmin"]);
    const supabase = await getSupabaseServer();

    // Fetch all feature flags
    const { data: featureFlags, error } = await supabase
      .from('feature_flags')
      .select('*')
      .order('category', { ascending: true })
      .order('feature_name', { ascending: true });

    if (error) {
      console.error('Error fetching feature flags:', error);
      return NextResponse.json(
        { error: 'Failed to fetch feature flags' },
        { status: 500 }
      );
    }

    return NextResponse.json({ featureFlags }, { status: 200 });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/feature-flags
 * Create a new feature flag (superadmin only)
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRole(["superadmin"]);
    const supabase = await getSupabaseServer();

    const body = await request.json();
    const { feature_key, feature_name, description, enabled, category, metadata } = body;

    // Validate required fields
    if (!feature_key || !feature_name) {
      return NextResponse.json(
        { error: 'feature_key and feature_name are required' },
        { status: 400 }
      );
    }

    // Create feature flag
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
      console.error('Error creating feature flag:', error);
      return NextResponse.json(
        { error: 'Failed to create feature flag' },
        { status: 500 }
      );
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: "superadmin",
      action: "admin.feature_flag.create",
      entity_type: "feature_flag",
      entity_id: featureFlag.id,
      metadata: { feature_key: feature_key, enabled: enabled ?? false },
    });

    return NextResponse.json({ featureFlag }, { status: 201 });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
