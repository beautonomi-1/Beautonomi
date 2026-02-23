import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/admin/gamification/badges/[id]
 * 
 * Get a specific badge (admin only)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleInApi(['superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    const { data: badge, error } = await supabase
      .from('provider_badges')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return handleApiError(
          new Error('Badge not found'),
          'NOT_FOUND',
          404
        );
      }
      throw error;
    }

    return successResponse({ badge });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch badge');
  }
}

/**
 * PATCH /api/admin/gamification/badges/[id]
 * 
 * Update a badge (admin only)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleInApi(['superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    const body = await request.json();
    const updateData: any = {};

    // Only update provided fields
    if (body.name !== undefined) updateData.name = body.name;
    if (body.slug !== undefined) updateData.slug = body.slug;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.icon_url !== undefined) updateData.icon_url = body.icon_url;
    if (body.tier !== undefined) {
      if (body.tier < 1 || body.tier > 10) {
        return handleApiError(
          new Error('Tier must be between 1 and 10'),
          'VALIDATION_ERROR',
          400
        );
      }
      updateData.tier = body.tier;
    }
    if (body.color !== undefined) updateData.color = body.color;
    if (body.requirements !== undefined) updateData.requirements = body.requirements;
    if (body.benefits !== undefined) updateData.benefits = body.benefits;
    if (body.is_active !== undefined) updateData.is_active = body.is_active;
    if (body.display_order !== undefined) updateData.display_order = body.display_order;

    const { data: badge, error } = await supabase
      .from('provider_badges')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return handleApiError(
          new Error('Badge not found'),
          'NOT_FOUND',
          404
        );
      }
      throw error;
    }

    return successResponse({
      badge,
      message: 'Badge updated successfully',
    });
  } catch (error) {
    return handleApiError(error, 'Failed to update badge');
  }
}

/**
 * DELETE /api/admin/gamification/badges/[id]
 * 
 * Delete a badge (admin only)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleInApi(['superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    // Check if badge is in use
    const { data: providersWithBadge, error: checkError } = await supabase
      .from('provider_points')
      .select('provider_id')
      .eq('current_badge_id', id)
      .limit(1);

    if (checkError) {
      throw checkError;
    }

    if (providersWithBadge && providersWithBadge.length > 0) {
      return handleApiError(
        new Error('Cannot delete badge that is currently assigned to providers. Deactivate it instead.'),
        'BADGE_IN_USE',
        400
      );
    }

    const { error } = await supabase
      .from('provider_badges')
      .delete()
      .eq('id', id);

    if (error) {
      if (error.code === 'PGRST116') {
        return handleApiError(
          new Error('Badge not found'),
          'NOT_FOUND',
          404
        );
      }
      throw error;
    }

    return successResponse({
      message: 'Badge deleted successfully',
    });
  } catch (error) {
    return handleApiError(error, 'Failed to delete badge');
  }
}
