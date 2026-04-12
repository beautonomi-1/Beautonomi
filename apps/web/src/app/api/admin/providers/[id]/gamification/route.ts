import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

/**
 * GET /api/admin/providers/[id]/gamification
 *
 * Fetch a provider's gamification data: points, current badge, badges earned, and recent transactions.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminSection(ADMIN_SECTION_PROVIDERS_OPERATIONS, request);
    const { id: providerId } = await params;
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    // Verify provider belongs to this tenant
    const { data: provider, error: provErr } = await supabase
      .from("providers")
      .select("id")
      .eq("id", providerId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (provErr) throw provErr;
    if (!provider) return notFoundResponse("Provider not found");

    const { data: pointsData } = await supabase
      .from("provider_points")
      .select(`
        id,
        total_points,
        current_badge_id,
        badge_earned_at,
        last_calculated_at,
        provider_badges!provider_points_current_badge_id_fkey (
          id, name, slug, tier, icon_url, requirements, description, color
        )
      `)
      .eq("provider_id", providerId)
      .maybeSingle();

    const { data: allBadges } = await supabase
      .from("provider_badges")
      .select("id, name, slug, tier, icon_url, requirements, description, color")
      .eq("is_active", true)
      .order("tier", { ascending: true });

    const { data: milestones } = await supabase
      .from("provider_milestones")
      .select("id, milestone_type, achieved_at, metadata")
      .eq("provider_id", providerId)
      .order("achieved_at", { ascending: false })
      .limit(20);

    const { data: transactions } = await supabase
      .from("provider_point_transactions")
      .select("id, points, source, description, created_at")
      .eq("provider_id", providerId)
      .order("created_at", { ascending: false })
      .limit(30);

    const badge = Array.isArray(pointsData?.provider_badges)
      ? pointsData?.provider_badges?.[0]
      : pointsData?.provider_badges;

    let progressToNextBadge = null;
    if (allBadges && pointsData) {
      const currentTier = (badge as { tier?: number } | null)?.tier || 0;
      const nextBadge = allBadges.find(
        (b: { tier: number }) => b.tier > currentTier
      );
      if (nextBadge) {
        const totalPoints = pointsData.total_points || 0;
        const nextMinPoints = Number(
          ((nextBadge as { requirements?: Record<string, unknown> }).requirements?.min_points as number | undefined) ?? 0
        );
        progressToNextBadge = {
          next_badge: nextBadge,
          points_needed: Math.max(0, nextMinPoints - totalPoints),
          progress_percent: Math.min(
            100,
            nextMinPoints > 0 ? Math.round((totalPoints / nextMinPoints) * 100) : 0
          ),
        };
      }
    }

    return successResponse({
      total_points: pointsData?.total_points || 0,
      current_badge: badge || null,
      badge_earned_at: pointsData?.badge_earned_at || null,
      last_calculated_at: pointsData?.last_calculated_at || null,
      all_badges: allBadges || [],
      milestones: milestones || [],
      recent_transactions: transactions || [],
      progress_to_next_badge: progressToNextBadge,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch gamification data");
  }
}
