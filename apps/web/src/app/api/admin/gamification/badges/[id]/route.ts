import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_MARKETING_COMMS } from "@/lib/admin-sections";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import {
  validateBadgeBenefits,
  validateBadgeRequirements,
} from "@/lib/gamification/validate-badge-payload";

/**
 * GET /api/admin/gamification/badges/[id]
 *
 * Get a specific badge (superadmin only). Uses admin client to bypass RLS.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);
    const supabase = getSupabaseAdmin();
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
 * Update a badge (superadmin only). Uses admin client to bypass RLS.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);
    const supabase = getSupabaseAdmin();
    const { id } = await params;

    const body = await request.json();
    const updateData: Record<string, unknown> = {};

    // Only update provided fields
    if (body.name !== undefined) updateData.name = body.name;
    if (body.slug !== undefined) updateData.slug = body.slug;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.icon_url !== undefined) updateData.icon_url = body.icon_url;
    if (body.tier !== undefined) {
      if (body.tier < 1 || body.tier > 10) {
        return errorResponse("Tier must be between 1 and 10", "VALIDATION_ERROR", 400);
      }
      updateData.tier = body.tier;
    }
    if (body.color !== undefined) updateData.color = body.color;
    if (body.requirements !== undefined) {
      try {
        updateData.requirements = validateBadgeRequirements(body.requirements);
      } catch (validationError) {
        const message =
          validationError instanceof Error ? validationError.message : "Invalid requirements";
        return errorResponse(message, "VALIDATION_ERROR", 400);
      }
    }
    if (body.benefits !== undefined) {
      try {
        updateData.benefits = validateBadgeBenefits(body.benefits);
      } catch (validationError) {
        const message =
          validationError instanceof Error ? validationError.message : "Invalid benefits";
        return errorResponse(message, "VALIDATION_ERROR", 400);
      }
    }
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

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "admin.gamification.badge.update",
      entity_type: "provider_badge",
      entity_id: id,
      module: "marketing_comms",
      risk_level: "medium",
      retention_tier: "routine",
      metadata: updateData,
      ...extractRequestMeta(request),
    });

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
 * Delete a badge (superadmin only). Uses admin client to bypass RLS.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);
    const supabase = getSupabaseAdmin();
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

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "admin.gamification.badge.delete",
      entity_type: "provider_badge",
      entity_id: id,
      module: "marketing_comms",
      risk_level: "medium",
      retention_tier: "routine",
      ...extractRequestMeta(request),
    });

    return successResponse({
      message: 'Badge deleted successfully',
    });
  } catch (error) {
    return handleApiError(error, 'Failed to delete badge');
  }
}
