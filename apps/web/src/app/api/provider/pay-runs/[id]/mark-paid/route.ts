import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  successResponse,
  notFoundResponse,
  handleApiError,
  getProviderIdForUser,
} from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/provider/pay-runs/[id]/mark-paid
 * Mark pay run as paid (manual payout recorded)
 */
export async function POST(
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

    const { data: payRun, error: fetchError } = await supabaseAdmin
      .from("provider_pay_runs")
      .select("id, status")
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

    const { error: updateError } = await supabaseAdmin
      .from("provider_pay_runs")
      .update({ status: "paid" })
      .eq("id", id);

    if (updateError) throw updateError;

    return successResponse({ status: "paid" });
  } catch (error) {
    return handleApiError(error, "Failed to mark pay run as paid");
  }
}
