import { NextRequest } from "next/server";
import { z } from "zod";
import {
  requireRoleInApi,
  successResponse,
  notFoundResponse,
  handleApiError,
  getProviderIdForUser,
} from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getStaffPermissions, hasPermission, isProviderOwner } from "@/lib/auth/permissions";
import { providerStaffPatchFromPayPlan } from "@/lib/payroll/apply-pay-plan-to-staff";

const payModelSchema = z.enum([
  "commission_only",
  "base_plus_commission",
  "base_or_commission_higher",
  "commission_above_threshold",
  "hourly",
  "hourly_plus_commission",
  "salary",
  "booth_renter",
]);

async function assertManagePayroll(
  userId: string,
  request: NextRequest,
): Promise<void> {
  if (await isProviderOwner(userId, request)) return;
  const perms = await getStaffPermissions(userId, undefined, request);
  if (!perms.manage_payroll) {
    throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
  }
}

async function assertViewPayPlan(
  userId: string,
  request: NextRequest,
): Promise<void> {
  if (await isProviderOwner(userId, request)) return;
  if (await hasPermission(userId, "manage_team", undefined, request)) return;
  await assertManagePayroll(userId, request);
}

const upsertSchema = z.object({
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pay_model: payModelSchema,
  employment_type: z.enum(["employee", "contractor", "apprentice"]).optional(),
  base_amount: z.number().min(0).nullable().optional(),
  hourly_rate: z.number().min(0).nullable().optional(),
  service_rate: z.number().min(0).max(100).nullable().optional(),
  product_rate: z.number().min(0).max(100).nullable().optional(),
  tier_mode: z.enum(["retroactive", "marginal"]).optional(),
  threshold_amount: z.number().min(0).nullable().optional(),
  tiers: z.array(z.record(z.string(), z.unknown())).optional(),
  statutory_mode: z.enum(["auto", "manual", "none"]).optional(),
});

/**
 * GET /api/provider/staff/[id]/pay-plans
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const { id: staffId } = await params;
    const admin = getSupabaseAdmin();
    const providerId = await getProviderIdForUser(user.id, admin, { request });
    if (!providerId) return notFoundResponse("Provider not found");

    await assertViewPayPlan(user.id, request);

    const { data, error } = await admin
      .from("staff_pay_plans")
      .select("*")
      .eq("staff_id", staffId)
      .eq("provider_id", providerId)
      .order("effective_from", { ascending: false })
      .limit(24);

    if (error) throw error;

    const { data: staffRow } = await admin
      .from("provider_staff")
      .select("statutory_mode")
      .eq("id", staffId)
      .eq("provider_id", providerId)
      .maybeSingle();
    const staffStatutory = staffRow?.statutory_mode ?? "auto";
    const rows = (data ?? []).map((row, idx) =>
      idx === 0
        ? {
            ...row,
            statutory_mode: (row as { statutory_mode?: string }).statutory_mode ?? staffStatutory,
          }
        : row,
    );

    return successResponse(rows);
  } catch (error) {
    return handleApiError(error, "Failed to load pay plans");
  }
}

/**
 * POST /api/provider/staff/[id]/pay-plans — create a new effective-dated plan row.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const { id: staffId } = await params;
    const body = upsertSchema.parse(await request.json());
    const admin = getSupabaseAdmin();
    const providerId = await getProviderIdForUser(user.id, admin, { request });
    if (!providerId) return notFoundResponse("Provider not found");

    await assertManagePayroll(user.id, request);

    const { data: staff } = await admin
      .from("provider_staff")
      .select("id")
      .eq("id", staffId)
      .eq("provider_id", providerId)
      .maybeSingle();
    if (!staff) return notFoundResponse("Staff not found");

    const { data: prev } = await admin
      .from("staff_pay_plans")
      .select("id, effective_from")
      .eq("staff_id", staffId)
      .is("effective_to", null)
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (prev && body.effective_from > (prev as { effective_from: string }).effective_from) {
      const dayBefore = new Date(`${body.effective_from}T12:00:00Z`);
      dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
      await admin
        .from("staff_pay_plans")
        .update({ effective_to: dayBefore.toISOString().slice(0, 10) })
        .eq("id", (prev as { id: string }).id);
    }

    const { data: inserted, error } = await admin
      .from("staff_pay_plans")
      .insert({
        staff_id: staffId,
        provider_id: providerId,
        effective_from: body.effective_from,
        pay_model: body.pay_model,
        employment_type: body.employment_type ?? "employee",
        base_amount: body.base_amount ?? null,
        hourly_rate: body.hourly_rate ?? null,
        service_rate: body.service_rate ?? null,
        product_rate: body.product_rate ?? null,
        tier_mode: body.tier_mode ?? "retroactive",
        threshold_amount: body.threshold_amount ?? null,
        tiers: body.tiers ?? [],
      })
      .select("*")
      .single();

    if (error) throw error;

    const staffPatch = providerStaffPatchFromPayPlan(body);
    if (body.statutory_mode) {
      staffPatch.statutory_mode = body.statutory_mode;
    }
    await admin.from("provider_staff").update(staffPatch).eq("id", staffId);

    if (body.tiers !== undefined) {
      await admin.from("provider_staff_commission_tiers").delete().eq("staff_id", staffId);
      if (body.tiers.length > 0) {
        const tierRows = body.tiers.map((t, i) => {
          const row = t as {
            min_revenue?: number;
            commission_rate?: number;
            tier_order?: number;
          };
          return {
            staff_id: staffId,
            min_revenue: Number(row.min_revenue ?? 0),
            commission_rate: Number(row.commission_rate ?? 0),
            tier_order: row.tier_order ?? i,
          };
        });
        await admin.from("provider_staff_commission_tiers").insert(tierRows);
      }
    }

    return successResponse(inserted);
  } catch (error) {
    return handleApiError(error, "Failed to save pay plan");
  }
}
