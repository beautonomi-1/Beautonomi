import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { z } from "zod";
import { resolveStaffPermissionRow } from "@/lib/auth/permissions";
import { canViewStaffPay } from "@/lib/auth/provider-team-roster-access";
import { resolveStaffRates } from "@/lib/payroll/resolve-staff-rates";

const tierSchema = z.object({
  id: z.string().uuid().optional(),
  min_revenue: z.number().min(0),
  commission_rate: z.number().min(0).max(100),
  tier_order: z.number().int().optional(),
});

const patchSchema = z.object({
  commission_enabled: z.boolean().optional(),
  service_commission_rate: z.number().min(0).max(100).optional(),
  product_commission_rate: z.number().min(0).max(100).optional(),
  hourly_rate: z.number().min(0).optional(),
  salary: z.number().min(0).optional(),
  tips_enabled: z.boolean().optional(),
  tiers: z.array(tierSchema).optional(),
});

/**
 * GET /api/provider/staff/[id]/commission
 * Get commission settings for a staff member
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const providerId = await getProviderIdForUser(user.id, supabase, { request });

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Verify staff member belongs to provider
    const { data: staff, error: staffError } = await getSupabaseAdmin()
      .from("provider_staff")
      .select(
        "id, user_id, commission_enabled, service_commission_rate, product_commission_rate, commission_rate, commission_percentage, hourly_rate, salary, tips_enabled"
      )
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (staffError || !staff) {
      return notFoundResponse("Staff member not found");
    }

    const seePay = staff.user_id === user.id || (await canViewStaffPay(user.id, request));
    if (!seePay) {
      const { data: callerStaff } = await getSupabaseAdmin()
        .from("provider_staff")
        .select("role, permissions, role_id, is_admin, user_id, provider_id")
        .eq("user_id", user.id)
        .eq("provider_id", providerId)
        .eq("is_active", true)
        .maybeSingle();
      if (!callerStaff) return notFoundResponse("Staff member not found");
      const perms = await resolveStaffPermissionRow(supabase, callerStaff, providerId);
      if (!perms.manage_team) return notFoundResponse("Staff member not found");
    }

    // Fetch commission tiers
    const { data: tiers } = await supabase
      .from("provider_staff_commission_tiers")
      .select("id, min_revenue, commission_rate, tier_order")
      .eq("staff_id", id)
      .order("min_revenue", { ascending: false });

    const rates = resolveStaffRates(staff);
    return successResponse({
      enabled: staff.commission_enabled ?? false,
      serviceCommissionRate: rates.serviceRate,
      productCommissionRate: rates.productRate,
      hourlyRate: seePay ? (staff.hourly_rate ?? 0) : null,
      salary: seePay ? (staff.salary ?? 0) : null,
      tipsEnabled: staff.tips_enabled ?? true,
      tiers: (tiers || []).map((t) => ({
        id: t.id,
        minRevenue: Number(t.min_revenue ?? 0),
        commissionRate: Number(t.commission_rate ?? 0),
        tierOrder: t.tier_order ?? 0,
      })),
    });
  } catch (error) {
    return handleApiError(error, "Failed to load commission settings");
  }
}

/**
 * PATCH /api/provider/staff/[id]/commission
 * Update commission settings for a staff member
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const providerId = await getProviderIdForUser(user.id, supabase, { request });

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const body = patchSchema.parse(await request.json());

    const payFieldTouched =
      body.commission_enabled !== undefined ||
      body.service_commission_rate !== undefined ||
      body.product_commission_rate !== undefined ||
      body.hourly_rate !== undefined ||
      body.salary !== undefined ||
      body.tiers !== undefined;
    if (payFieldTouched) {
      if (!(await canViewStaffPay(user.id, request))) {
        return handleApiError(
          new Error("You do not have permission to manage payroll"),
          "FORBIDDEN",
          403,
        );
      }
    }

    // Verify staff member belongs to provider
    const { data: existing } = await getSupabaseAdmin()
      .from("provider_staff")
      .select("id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!existing) {
      return notFoundResponse("Staff member not found");
    }

    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (body.commission_enabled !== undefined) {
      updateData.commission_enabled = body.commission_enabled;
    }
    if (body.service_commission_rate !== undefined) {
      updateData.service_commission_rate = body.service_commission_rate;
    }
    if (body.product_commission_rate !== undefined) {
      updateData.product_commission_rate = body.product_commission_rate;
    }
    if (body.hourly_rate !== undefined) {
      updateData.hourly_rate = body.hourly_rate;
    }
    if (body.salary !== undefined) {
      updateData.salary = body.salary;
    }
    if (body.tips_enabled !== undefined) {
      updateData.tips_enabled = body.tips_enabled;
    }

    // Handle commission tiers: replace all tiers for this staff
    if (body.tiers !== undefined) {
      await supabase
        .from("provider_staff_commission_tiers")
        .delete()
        .eq("staff_id", id);

      if (body.tiers.length > 0) {
        const tierRows = body.tiers.map((t, i) => ({
          staff_id: id,
          min_revenue: t.min_revenue,
          commission_rate: t.commission_rate,
          tier_order: t.tier_order ?? i,
        }));
        await supabase.from("provider_staff_commission_tiers").insert(tierRows);
      }
    }

    const { data, error } = await getSupabaseAdmin()
      .from("provider_staff")
      .update(updateData)
      .eq("id", id)
      .select(
        "commission_enabled, service_commission_rate, product_commission_rate, commission_rate, commission_percentage, hourly_rate, salary, tips_enabled"
      )
      .single();

    if (error) {
      throw error;
    }

    // Refetch tiers after update
    const { data: tiers } = await supabase
      .from("provider_staff_commission_tiers")
      .select("id, min_revenue, commission_rate, tier_order")
      .eq("staff_id", id)
      .order("min_revenue", { ascending: false });

    const savedRates = resolveStaffRates(data ?? {});
    return successResponse({
      enabled: data?.commission_enabled ?? false,
      serviceCommissionRate: savedRates.serviceRate,
      productCommissionRate: savedRates.productRate,
      hourlyRate: data?.hourly_rate ?? 0,
      salary: data?.salary ?? 0,
      tipsEnabled: data?.tips_enabled ?? true,
      tiers: (tiers || []).map((t) => ({
        id: t.id,
        minRevenue: Number(t.min_revenue ?? 0),
        commissionRate: Number(t.commission_rate ?? 0),
        tierOrder: t.tier_order ?? 0,
      })),
    });
  } catch (error) {
    return handleApiError(error, "Failed to update commission settings");
  }
}
