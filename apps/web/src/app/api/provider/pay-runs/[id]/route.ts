import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  successResponse,
  notFoundResponse,
  handleApiError,
  getProviderIdForUser,
} from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const updateItemSchema = z.object({
  manual_deductions: z.number().min(0).optional(),
  tax_deduction: z.number().min(0).optional(),
  uif_contribution: z.number().min(0).optional(),
  notes: z.string().optional(),
});

/**
 * GET /api/provider/pay-runs/[id]
 * Get pay run with items
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const { id } = await params;

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");

    const { data: payRun, error: prError } = await supabaseAdmin
      .from("provider_pay_runs")
      .select("*")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (prError || !payRun) return notFoundResponse("Pay run not found");

    const { data: items, error: itemsError } = await supabaseAdmin
      .from("provider_pay_run_items")
      .select(`
        id,
        staff_id,
        gross_pay,
        commission_amount,
        hourly_amount,
        salary_amount,
        tips_amount,
        manual_deductions,
        tax_deduction,
        uif_contribution,
        taxable_income,
        net_pay,
        notes
      `)
      .eq("pay_run_id", id)
      .order("staff_id");

    if (itemsError) throw itemsError;

    const staffIds = (items || []).map((i: any) => i.staff_id);
    const { data: staffList } = await supabaseAdmin
      .from("provider_staff")
      .select("id, users(full_name)")
      .in("id", staffIds);

    const staffMap = new Map(
      (staffList || []).map((s: any) => [s.id, (s.users as any)?.full_name || "Unknown"])
    );

    const itemsWithNames = (items || []).map((i: any) => ({
      ...i,
      staff_name: staffMap.get(i.staff_id) || "Unknown",
    }));

    return successResponse({
      ...payRun,
      items: itemsWithNames,
    });
  } catch (error) {
    return handleApiError(error, "Failed to get pay run");
  }
}

/**
 * PATCH /api/provider/pay-runs/[id]
 * Update pay run items (deductions, etc). Only when status is draft.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner"], request);
    const { id } = await params;

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");

    const { data: payRun } = await supabaseAdmin
      .from("provider_pay_runs")
      .select("id, status")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!payRun || payRun.status !== "draft") {
      return handleApiError(
        new Error("Pay run not found or cannot be edited"),
        "INVALID_STATE",
        400
      );
    }

    const body = await request.json();
    if (Array.isArray(body.items)) {
      for (const item of body.items) {
        const { item_id, ...updates } = item;
        if (!item_id) continue;
        const parsed = updateItemSchema.safeParse(updates);
        if (!parsed.success) continue;

        const { manual_deductions, tax_deduction, uif_contribution, notes } = parsed.data;

        const updateData: Record<string, unknown> = {};
        if (manual_deductions !== undefined) updateData.manual_deductions = manual_deductions;
        if (tax_deduction !== undefined) updateData.tax_deduction = tax_deduction;
        if (uif_contribution !== undefined) updateData.uif_contribution = uif_contribution;
        if (notes !== undefined) updateData.notes = notes;

        if (Object.keys(updateData).length > 0) {
          const { data: existing } = await supabaseAdmin
            .from("provider_pay_run_items")
            .select("gross_pay, manual_deductions, tax_deduction, uif_contribution")
            .eq("id", item_id)
            .eq("pay_run_id", id)
            .single();

          if (existing) {
            const m = manual_deductions ?? (existing as any).manual_deductions ?? 0;
            const t = tax_deduction ?? (existing as any).tax_deduction ?? 0;
            const u = uif_contribution ?? (existing as any).uif_contribution ?? 0;
            const gross = Number((existing as any).gross_pay || 0);
            updateData.net_pay = Math.max(0, gross - m - t - u);
          }

          await supabaseAdmin
            .from("provider_pay_run_items")
            .update(updateData)
            .eq("id", item_id)
            .eq("pay_run_id", id);
        }
      }
    }

    const { data: updated } = await supabaseAdmin
      .from("provider_pay_runs")
      .select("*")
      .eq("id", id)
      .single();

    return successResponse(updated);
  } catch (error) {
    return handleApiError(error, "Failed to update pay run");
  }
}
