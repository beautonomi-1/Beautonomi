import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/admin/gamification/badges
 *
 * Get all badges (superadmin only). Uses admin client to bypass RLS.
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(['superadmin'], request);
    const supabase = getSupabaseAdmin();

    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('include_inactive') === 'true';

    let query = supabase
      .from('provider_badges')
      .select('*')
      .order('tier', { ascending: true })
      .order('display_order', { ascending: true });

    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    const { data: badges, error } = await query;

    if (error) {
      throw error;
    }

    return successResponse({
      badges: badges || [],
      total: badges?.length || 0,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch badges');
  }
}

/**
 * POST /api/admin/gamification/badges
 *
 * Create a new badge (superadmin only). Uses admin client to bypass RLS.
 */
export async function POST(request: NextRequest) {
  try {
    await requireRoleInApi(['superadmin'], request);
    const supabase = getSupabaseAdmin();

    const body = await request.json();
    const {
      name,
      slug,
      description,
      icon_url,
      tier,
      color,
      requirements,
      benefits,
      is_active = true,
      display_order = 0,
    } = body;

    // Validate required fields
    if (!name || !slug || !tier || !color || !requirements || !benefits) {
      return handleApiError(
        new Error('Missing required fields: name, slug, tier, color, requirements, benefits'),
        'VALIDATION_ERROR',
        400
      );
    }

    // Validate tier
    if (tier < 1 || tier > 10) {
      return handleApiError(
        new Error('Tier must be between 1 and 10'),
        'VALIDATION_ERROR',
        400
      );
    }

    const { data: badge, error } = await supabase
      .from('provider_badges')
      .insert({
        name,
        slug,
        description: description || null,
        icon_url: icon_url || null,
        tier,
        color,
        requirements,
        benefits,
        is_active,
        display_order,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return successResponse({
      badge,
      message: 'Badge created successfully',
    });
  } catch (error) {
    return handleApiError(error, 'Failed to create badge');
  }
}
