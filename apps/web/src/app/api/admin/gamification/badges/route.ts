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
 * GET /api/admin/gamification/badges
 *
 * Get all badges (superadmin only). Uses admin client to bypass RLS.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);
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
    const { user } = await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);
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

    if (!name || !slug || !tier || !color || requirements === undefined || benefits === undefined) {
      return errorResponse(
        "Missing required fields: name, slug, tier, color, requirements, benefits",
        "VALIDATION_ERROR",
        400
      );
    }

    if (tier < 1 || tier > 10) {
      return errorResponse("Tier must be between 1 and 10", "VALIDATION_ERROR", 400);
    }

    let validatedRequirements: Record<string, unknown>;
    let validatedBenefits: Record<string, unknown>;
    try {
      validatedRequirements = validateBadgeRequirements(requirements);
      validatedBenefits = validateBadgeBenefits(benefits);
    } catch (validationError) {
      const message =
        validationError instanceof Error ? validationError.message : "Invalid badge payload";
      return errorResponse(message, "VALIDATION_ERROR", 400);
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
        requirements: validatedRequirements,
        benefits: validatedBenefits,
        is_active,
        display_order,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "admin.gamification.badge.create",
      entity_type: "provider_badge",
      entity_id: badge.id,
      module: "marketing_comms",
      risk_level: "medium",
      retention_tier: "routine",
      metadata: { name, slug, tier },
      ...extractRequestMeta(request),
    });

    return successResponse({
      badge,
      message: 'Badge created successfully',
    });
  } catch (error) {
    return handleApiError(error, 'Failed to create badge');
  }
}
