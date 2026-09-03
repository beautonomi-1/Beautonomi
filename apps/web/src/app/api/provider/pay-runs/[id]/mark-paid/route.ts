import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  successResponse,
  notFoundResponse,
  handleApiError,
  errorResponse,
  getProviderIdForUser,
} from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { notifyPayRunStaff } from "@/lib/notifications/notify-staff-event";
import { z } from "zod";

const bodySchema = z.object({
  /** Bank / EFT / cash reference recorded on the pay run (payroll stays out of the GL). */
  payment_reference: z.string().trim().max(120).optional().nullable(),
  paid_at: z.string().datetime().optional().nullable(),
});

/**
 * POST /api/provider/pay-runs/[id]/mark-paid
 * Mark pay run as paid (manual payout recorded). Stores paid_at + payment_reference
 * and notifies each staff member on the run (staff_pay_run_paid).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner"], request);
    const { id } = await params;

    const raw = await request.text().catch(() => "");
    let parsedBody: z.infer<typeof bodySchema> = {};
    if (raw) {
      const parsed = bodySchema.safeParse(JSON.parse(raw));
      if (!parsed.success) {
        return errorResponse("Validation failed", "VALIDATION_ERROR", 400, parsed.error.issues);
      }
      parsedBody = parsed.data;
    }

    const supabaseAdmin = getSupabaseAdmin();

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");

    const { data: payRun, error: fetchError } = await supabaseAdmin
      .from("provider_pay_runs")
      .select("id, status, pay_period_start, pay_period_end")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (fetchError || !payRun) return notFoundResponse("Pay run not found");
    if (payRun.status !== "approved") {
      return handleApiError(
        new Error("Only approved pay runs can be marked as paid"),
        "INVALID_STATE",
        400
      );
    }

    const paidAt = parsedBody.paid_at ?? new Date().toISOString();
    const paymentReference = parsedBody.payment_reference?.trim() || null;

    const { error: updateError } = await supabaseAdmin
      .from("provider_pay_runs")
      .update({
        status: "paid",
        paid_at: paidAt,
        payment_reference: paymentReference,
        paid_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) throw updateError;

    void notifyPayRunStaff(supabaseAdmin, id, "staff_pay_run_paid", {
      periodStart: payRun.pay_period_start as string,
      periodEnd: payRun.pay_period_end as string,
      paymentReference,
    }).catch((err) => console.warn("[pay-runs/mark-paid] notify failed:", err));

    return successResponse({ status: "paid", paid_at: paidAt, payment_reference: paymentReference });
  } catch (error) {
    return handleApiError(error, "Failed to mark pay run as paid");
  }
}
