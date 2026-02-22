import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";

/**
 * GET /api/provider/settings/team/commissions
 * Return staff commission settings for the current provider.
 * Reads from `provider_staff.commission_percentage` and
 * `provider_staff_commission_tiers` for tiered commissions.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff"],
      request
    );
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { searchParams } = new URL(request.url);
    const staffId = searchParams.get("staff_id");

    // Get staff with their base commission percentage
    let staffQuery = supabase
      .from("provider_staff")
      .select("id, name, email, role, commission_percentage, is_active")
      .eq("provider_id", providerId)
      .eq("is_active", true);

    if (staffId) {
      staffQuery = staffQuery.eq("id", staffId);
    }

    const { data: staffMembers, error: staffError } = await staffQuery.order(
      "name",
      { ascending: true }
    );

    if (staffError) {
      throw staffError;
    }

    // Get tiered commission data for all relevant staff
    const staffIds = (staffMembers || []).map((s: any) => s.id);
    let tiers: any[] = [];

    if (staffIds.length > 0) {
      const { data: tierData, error: tierError } = await supabase
        .from("provider_staff_commission_tiers")
        .select(
          "id, staff_id, min_revenue, commission_rate, tier_order, created_at"
        )
        .in("staff_id", staffIds)
        .order("tier_order", { ascending: true });

      if (tierError) {
        console.warn("Error fetching commission tiers:", tierError);
      } else {
        tiers = tierData || [];
      }
    }

    // Group tiers by staff_id
    const tiersByStaff: Record<string, any[]> = {};
    tiers.forEach((tier: any) => {
      if (!tiersByStaff[tier.staff_id]) {
        tiersByStaff[tier.staff_id] = [];
      }
      tiersByStaff[tier.staff_id].push({
        id: tier.id,
        minRevenue: tier.min_revenue,
        commissionRate: tier.commission_rate,
        tierOrder: tier.tier_order,
      });
    });

    const result = (staffMembers || []).map((member: any) => ({
      staffId: member.id,
      name: member.name,
      email: member.email,
      role: member.role,
      commissionPercentage: member.commission_percentage ?? 0,
      tiers: tiersByStaff[member.id] || [],
    }));

    return successResponse(result);
  } catch (error) {
    return handleApiError(error, "Failed to load commission settings");
  }
}

/**
 * PATCH /api/provider/settings/team/commissions
 * Update commission settings for a staff member.
 * Body: {
 *   staffId: string,
 *   commissionPercentage?: number,
 *   tiers?: Array<{ minRevenue: number, commissionRate: number, tierOrder: number }>
 * }
 */
export async function PATCH(request: NextRequest) {
  try {
    const permissionCheck = await requirePermission("manage_team", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const body = await request.json();
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { staffId, commissionPercentage, tiers } = body;

    if (!staffId) {
      return handleApiError(
        new Error("staffId is required"),
        "staffId is required",
        "VALIDATION_ERROR",
        400
      );
    }

    // Verify staff belongs to this provider
    const { data: staff, error: staffError } = await supabase
      .from("provider_staff")
      .select("id")
      .eq("id", staffId)
      .eq("provider_id", providerId)
      .single();

    if (staffError || !staff) {
      return notFoundResponse("Staff member not found");
    }

    // Update base commission percentage
    if (commissionPercentage !== undefined) {
      const { error: updateError } = await supabase
        .from("provider_staff")
        .update({ commission_percentage: Number(commissionPercentage) })
        .eq("id", staffId)
        .eq("provider_id", providerId);

      if (updateError) {
        throw updateError;
      }
    }

    // Update tiered commissions if provided
    if (Array.isArray(tiers)) {
      // Delete existing tiers for this staff member
      const { error: deleteError } = await supabase
        .from("provider_staff_commission_tiers")
        .delete()
        .eq("staff_id", staffId);

      if (deleteError) {
        throw deleteError;
      }

      // Insert new tiers
      if (tiers.length > 0) {
        const tierRows = tiers.map(
          (tier: any, index: number) => ({
            staff_id: staffId,
            min_revenue: Number(tier.minRevenue),
            commission_rate: Number(tier.commissionRate),
            tier_order: tier.tierOrder ?? index,
          })
        );

        const { error: insertError } = await supabase
          .from("provider_staff_commission_tiers")
          .insert(tierRows);

        if (insertError) {
          throw insertError;
        }
      }
    }

    // Return the updated data
    const { data: updatedStaff } = await supabase
      .from("provider_staff")
      .select("id, name, commission_percentage")
      .eq("id", staffId)
      .single();

    const { data: updatedTiers } = await supabase
      .from("provider_staff_commission_tiers")
      .select("id, min_revenue, commission_rate, tier_order")
      .eq("staff_id", staffId)
      .order("tier_order", { ascending: true });

    return successResponse({
      staffId: updatedStaff?.id,
      name: updatedStaff?.name,
      commissionPercentage: updatedStaff?.commission_percentage ?? 0,
      tiers: (updatedTiers || []).map((t: any) => ({
        id: t.id,
        minRevenue: t.min_revenue,
        commissionRate: t.commission_rate,
        tierOrder: t.tier_order,
      })),
    });
  } catch (error) {
    return handleApiError(error, "Failed to update commission settings");
  }
}
