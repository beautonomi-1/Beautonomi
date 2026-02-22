import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi } from "@/lib/supabase/api-helpers";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit/audit";

const markFailedSchema = z.object({
  failure_reason: z.string().min(1, "Failure reason is required"),
});

/**
 * POST /api/admin/payouts/[id]/mark-failed
 * 
 * Mark a payout as failed
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["superadmin"]);
    const { id } = await params;
    const supabase = await getSupabaseServer();

    if (!supabase) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Supabase client not available",
            code: "SERVER_ERROR",
          },
        },
        { status: 500 }
      );
    }
    const body = await request.json();

    // Validate request body
    const validationResult = markFailedSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Validation failed",
            code: "VALIDATION_ERROR",
            details: validationResult.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
          },
        },
        { status: 400 }
      );
    }

    // Get payout
    const { data: payout } = await supabase
      .from("payouts")
      .select("*")
      .eq("id", id)
      .single();

    if (!payout) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Payout not found",
            code: "NOT_FOUND",
          },
        },
        { status: 404 }
      );
    }

    const payoutData = payout as any;

    if (payoutData.status === "completed") {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Cannot mark paid payout as failed",
            code: "ALREADY_PAID",
          },
        },
        { status: 400 }
      );
    }

    // Update payout status
    const { data: updatedPayout, error } = await (supabase
      .from("payouts") as any)
      .update({
        status: "failed",
        failure_reason: validationResult.data.failure_reason,
        processed_at: new Date().toISOString(),
        failed_at: new Date().toISOString(),
        processed_by: user.id,
      })
      .eq("id", id)
      .select()
      .single();

    if (error || !updatedPayout) {
      console.error("Error updating payout:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to update payout",
            code: "UPDATE_ERROR",
          },
        },
        { status: 500 }
      );
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: (user as any).role || "superadmin",
      action: "admin.payout.failed",
      entity_type: "payout",
      entity_id: id,
      metadata: { provider_id: (payoutData as any).provider_id, amount: (payoutData as any).amount, failure_reason: validationResult.data.failure_reason },
    });

    // Send OneSignal notification to provider
    try {
      const { sendToUser } = await import("@/lib/notifications/onesignal");
      
      // Get provider owner
      const { data: provider } = await supabase
        .from("providers")
        .select("user_id, business_name")
        .eq("id", (payoutData as any).provider_id)
        .single();

      if (provider) {
        const providerUserId = (provider as any).user_id;
        await sendToUser(providerUserId, {
          title: "Payout Failed",
          message: `Your payout of ZAR ${(payoutData as any).amount.toLocaleString()} could not be processed. Reason: ${validationResult.data.failure_reason}`,
          data: {
            type: "payout_failed",
            payout_id: id,
          },
          url: "/provider/finance",
        });
      }
    } catch (notifError) {
      console.error("Error sending notification:", notifError);
    }

    return NextResponse.json({
      data: updatedPayout,
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/payouts/[id]/mark-failed:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to update payout",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
