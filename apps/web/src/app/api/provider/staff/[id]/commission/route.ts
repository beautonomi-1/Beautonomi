import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { z } from "zod";

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
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Verify staff member belongs to provider
    const { data: staff, error: staffError } = await supabase
      .from("provider_staff")
      .select(
        "id, commission_enabled, service_commission_rate, product_commission_rate, commission_rate, hourly_rate, salary, tips_enabled"
      )
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (staffError || !staff) {
      return notFoundResponse("Staff member not found");
    }

    // Fetch commission tiers
    const { data: tiers } = await supabase
      .from("provider_staff_commission_tiers")
      .select("id, min_revenue, commission_rate, tier_order")
      .eq("staff_id", id)
      .order("min_revenue", { ascending: false });

    return successResponse({
      enabled: staff.commission_enabled ?? false,
      serviceCommissionRate: staff.service_commission_rate ?? staff.commission_rate ?? 0,
      productCommissionRate: staff.product_commission_rate ?? staff.commission_rate ?? 0,
      hourlyRate: staff.hourly_rate ?? 0,
      salary: staff.salary ?? 0,
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
    const { user } = await requireRoleInApi(["provider_owner"], request);
    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const body = patchSchema.parse(await request.json());

    // Verify staff member belongs to provider
    const { data: existing } = await supabase
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

    const { data, error } = await supabase
      .from("provider_staff")
      .update(updateData)
      .eq("id", id)
      .select(
        "commission_enabled, service_commission_rate, product_commission_rate, commission_rate, hourly_rate, salary, tips_enabled"
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

    return successResponse({
      enabled: data?.commission_enabled ?? false,
      serviceCommissionRate: data?.service_commission_rate ?? data?.commission_rate ?? 0,
      productCommissionRate: data?.product_commission_rate ?? data?.commission_rate ?? 0,
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
