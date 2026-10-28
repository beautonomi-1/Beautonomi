import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  successResponse,
  notFoundResponse,
  handleApiError,
  getProviderIdForUser,
} from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { z } from "zod";
import { payrollDisabledMessage, userCanManagePayroll } from "@/lib/payroll/payroll-access";
import { requireManagePayroll } from "@/lib/payroll/require-manage-payroll";
import { computeNetPay } from "@/lib/payroll/net-pay";

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

    const supabaseAdmin = getSupabaseAdmin();

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");
    const payrollBlocked = await payrollDisabledMessage(supabaseAdmin, providerId);
    if (payrollBlocked) {
      return handleApiError(new Error(payrollBlocked), "PAYROLL_UNAVAILABLE", 403);
    }

    const { data: payRun, error: prError } = await supabaseAdmin
      .from("provider_pay_runs")
      .select("*")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (prError || !payRun) return notFoundResponse("Pay run not found");

    const canManagePayroll = await userCanManagePayroll(user.id, request);
    let callerStaffId: string | null = null;
    if (!canManagePayroll) {
      const { data: callerStaff } = await supabaseAdmin
        .from("provider_staff")
        .select("id")
        .eq("user_id", user.id)
        .eq("provider_id", providerId)
        .eq("is_active", true)
        .is("deleted_at", null)
        .maybeSingle();
      if (!callerStaff) return notFoundResponse("Pay run not found");
      callerStaffId = callerStaff.id;
    }

    let itemsQuery = supabaseAdmin
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
        commission_clawback,
        carry_forward_in,
        carry_forward_out,
        notes
      `)
      .eq("pay_run_id", id)
      .order("staff_id");

    if (callerStaffId) {
      itemsQuery = itemsQuery.eq("staff_id", callerStaffId);
    }

    const { data: items, error: itemsError } = await itemsQuery;

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
 * DELETE /api/provider/pay-runs/[id]
 * Delete a draft pay run.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const payrollCheck = await requireManagePayroll(request);
    if (!payrollCheck.authorized) {
      return payrollCheck.response!;
    }
    const { user } = payrollCheck;
    const { id } = await params;
    const supabaseAdmin = getSupabaseAdmin();
    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");
    const payrollBlockedDel = await payrollDisabledMessage(supabaseAdmin, providerId);
    if (payrollBlockedDel) {
      return handleApiError(new Error(payrollBlockedDel), "PAYROLL_UNAVAILABLE", 403);
    }

    const { data: payRun } = await supabaseAdmin
      .from("provider_pay_runs")
      .select("id, status")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!payRun || payRun.status !== "draft") {
      return handleApiError(new Error("Only draft pay runs can be deleted"), "INVALID_STATE", 400);
    }

    await supabaseAdmin.from("provider_pay_runs").delete().eq("id", id);
    return successResponse({ deleted: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete pay run");
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
    const payrollCheck = await requireManagePayroll(request);
    if (!payrollCheck.authorized) {
      return payrollCheck.response!;
    }
    const { user } = payrollCheck;
    const { id } = await params;

    const supabaseAdmin = getSupabaseAdmin();

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");
    const payrollBlockedPatch = await payrollDisabledMessage(supabaseAdmin, providerId);
    if (payrollBlockedPatch) {
      return handleApiError(new Error(payrollBlockedPatch), "PAYROLL_UNAVAILABLE", 403);
    }

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

        const updateData: Record<string, any> = {};
        if (manual_deductions !== undefined) updateData.manual_deductions = manual_deductions;
        if (tax_deduction !== undefined) updateData.tax_deduction = tax_deduction;
        if (uif_contribution !== undefined) updateData.uif_contribution = uif_contribution;
        if (notes !== undefined) updateData.notes = notes;

        if (Object.keys(updateData).length > 0) {
          const { data: existing } = await supabaseAdmin
            .from("provider_pay_run_items")
            .select(
              "gross_pay, manual_deductions, tax_deduction, uif_contribution, carry_forward_in",
            )
            .eq("id", item_id)
            .eq("pay_run_id", id)
            .single();

          if (existing) {
            const ex = existing as {
              gross_pay?: number;
              manual_deductions?: number;
              tax_deduction?: number;
              uif_contribution?: number;
              carry_forward_in?: number;
            };
            const m = manual_deductions ?? ex.manual_deductions ?? 0;
            const t = tax_deduction ?? ex.tax_deduction ?? 0;
            const u = uif_contribution ?? ex.uif_contribution ?? 0;
            const gross = Number(ex.gross_pay || 0);
            const carryIn = Number(ex.carry_forward_in ?? 0);
            const net = computeNetPay({
              grossPay: gross,
              manualDeductions: m,
              taxDeduction: t,
              uifContribution: u,
              carryForwardBalance: carryIn > 0 ? -carryIn : undefined,
            });
            updateData.net_pay = net.netPay;
            updateData.carry_forward_out =
              net.nextCarryForward !== 0 ? Math.abs(net.nextCarryForward) : 0;
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
