import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
  notFoundResponse,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { getStaffPermissions, isProviderOwner } from "@/lib/auth/permissions";

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

    const owner = await isProviderOwner(user.id, request);
    let canViewAll = owner;
    if (!canViewAll) {
      const perms = await getStaffPermissions(user.id, undefined, request);
      canViewAll = Boolean(perms.manage_payroll || perms.manage_team);
    }

    // Get staff with their base commission percentage
    let staffQuery = supabase
      .from("provider_staff")
      .select(
        "id, user_id, name, email, role, commission_percentage, service_commission_rate, product_commission_rate, commission_rate, is_active",
      )
      .eq("provider_id", providerId)
      .eq("is_active", true);
    if (!canViewAll) {
      staffQuery = staffQuery.eq("user_id", user.id);
    }

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

    const result = (staffMembers || []).map((member: any) => {
      const serviceRate =
        member.service_commission_rate ?? member.commission_rate ?? member.commission_percentage ?? 0;
      const productRate =
        member.product_commission_rate ?? member.commission_rate ?? member.commission_percentage ?? 0;
      return {
        staffId: member.id,
        name: member.name,
        email: member.email,
        role: member.role,
        commissionPercentage: serviceRate,
        serviceCommissionRate: serviceRate,
        productCommissionRate: productRate,
        tiers: tiersByStaff[member.id] || [],
      };
    });

    const view = searchParams.get("view");
    if (view === "setup") {
      const [{ data: staffFull }, { data: offerings }, { data: settings }] = await Promise.all([
        (() => {
          let setupStaff = supabase
            .from("provider_staff")
            .select("id, name, commission_enabled, service_commission_rate, product_commission_rate")
            .eq("provider_id", providerId)
            .eq("is_active", true)
            .is("deleted_at", null);
          if (!canViewAll) setupStaff = setupStaff.eq("user_id", user.id);
          return setupStaff;
        })(),
        supabase
          .from("offerings")
          .select("id, team_member_commission_enabled")
          .eq("provider_id", providerId)
          .eq("is_active", true)
          .is("parent_service_id", null),
        supabase
          .from("provider_settings")
          .select("staff_share_cancellation_fee")
          .eq("provider_id", providerId)
          .maybeSingle(),
      ]);
      const enabledStaff = (staffFull ?? []).filter((s: { commission_enabled?: boolean | null }) => s.commission_enabled === true);
      const zeroRateStaff = enabledStaff.filter((s: { service_commission_rate?: number | null; product_commission_rate?: number | null }) => {
        const serviceRate = Number(s.service_commission_rate ?? 0);
        const productRate = Number(s.product_commission_rate ?? 0);
        return serviceRate <= 0 && productRate <= 0;
      });
      const disabledServices = (offerings ?? []).filter(
        (o: { team_member_commission_enabled?: boolean | null }) => o.team_member_commission_enabled === false,
      );
      return successResponse({
        staff: result,
        staff_share_cancellation_fee:
          (settings as { staff_share_cancellation_fee?: boolean | null } | null)?.staff_share_cancellation_fee === true,
        checklist: {
          staff_with_commission_enabled: enabledStaff.length,
          staff_enabled_zero_rate: zeroRateStaff.length,
          services_with_staff_commission_disabled: disabledServices.length,
          active_services: (offerings ?? []).length,
        },
      });
    }

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

    const {
      staffId,
      commissionPercentage,
      serviceCommissionRate,
      productCommissionRate,
      tiers,
      staff_share_cancellation_fee,
    } = body;

    if (staff_share_cancellation_fee !== undefined && !staffId) {
      const enabled = staff_share_cancellation_fee === true;
      const { data: existing } = await supabase
        .from("provider_settings")
        .select("id")
        .eq("provider_id", providerId)
        .maybeSingle();
      if (existing) {
        const { error: updateErr } = await supabase
          .from("provider_settings")
          .update({ staff_share_cancellation_fee: enabled })
          .eq("provider_id", providerId);
        if (updateErr) throw updateErr;
      } else {
        const { error: insertErr } = await supabase
          .from("provider_settings")
          .insert({ provider_id: providerId, staff_share_cancellation_fee: enabled });
        if (insertErr) throw insertErr;
      }
      return successResponse({ staff_share_cancellation_fee: enabled });
    }

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

    const rateUpdate: Record<string, number> = {};
    const parsePct = (raw: unknown, field: string): number | Response => {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        return errorResponse(`${field} must be between 0 and 100`, "VALIDATION_ERROR", 400);
      }
      return n;
    };
    if (serviceCommissionRate !== undefined) {
      const n = parsePct(serviceCommissionRate, "service_commission_rate");
      if (n instanceof Response) return n;
      rateUpdate.service_commission_rate = n;
    }
    if (productCommissionRate !== undefined) {
      const n = parsePct(productCommissionRate, "product_commission_rate");
      if (n instanceof Response) return n;
      rateUpdate.product_commission_rate = n;
    }
    if (commissionPercentage !== undefined) {
      const pct = parsePct(commissionPercentage, "commission_percentage");
      if (pct instanceof Response) return pct;
      if (serviceCommissionRate === undefined) {
        rateUpdate.service_commission_rate = pct;
      }
      if (productCommissionRate === undefined) {
        rateUpdate.product_commission_rate = pct;
      }
    }
    if (Object.keys(rateUpdate).length > 0) {
      const { error: updateError } = await supabase
        .from("provider_staff")
        .update(rateUpdate)
        .eq("id", staffId)
        .eq("provider_id", providerId);

      if (updateError) {
        throw updateError;
      }
    }

    // Update tiered commissions if provided
    if (Array.isArray(tiers)) {
      const tierRows = [];
      for (let index = 0; index < tiers.length; index++) {
        const tier = tiers[index] as { minRevenue?: unknown; commissionRate?: unknown; tierOrder?: number };
        const minRevenue = Number(tier.minRevenue);
        if (!Number.isFinite(minRevenue) || minRevenue < 0) {
          return errorResponse("min_revenue must be 0 or greater", "VALIDATION_ERROR", 400);
        }
        const rate = parsePct(tier.commissionRate, "commission_rate");
        if (rate instanceof Response) return rate;
        tierRows.push({
          staff_id: staffId,
          min_revenue: minRevenue,
          commission_rate: rate,
          tier_order: tier.tierOrder ?? index,
        });
      }

      const { error: deleteError } = await supabase
        .from("provider_staff_commission_tiers")
        .delete()
        .eq("staff_id", staffId);

      if (deleteError) {
        throw deleteError;
      }

      if (tierRows.length > 0) {
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
      .select(
        "id, name, commission_percentage, service_commission_rate, product_commission_rate, commission_rate",
      )
      .eq("id", staffId)
      .single();

    const { data: updatedTiers } = await supabase
      .from("provider_staff_commission_tiers")
      .select("id, min_revenue, commission_rate, tier_order")
      .eq("staff_id", staffId)
      .order("tier_order", { ascending: true });

    const serviceRate =
      updatedStaff?.service_commission_rate ??
      updatedStaff?.commission_rate ??
      updatedStaff?.commission_percentage ??
      0;
    const productRate =
      updatedStaff?.product_commission_rate ??
      updatedStaff?.commission_rate ??
      updatedStaff?.commission_percentage ??
      0;

    return successResponse({
      staffId: updatedStaff?.id,
      name: updatedStaff?.name,
      commissionPercentage: serviceRate,
      serviceCommissionRate: serviceRate,
      productCommissionRate: productRate,
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
