import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
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
    const { user } = await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const { id } = await params;
    const supabase = await getSupabaseServer(request);

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

    type PayoutRow = { status: string; provider_id: string; amount: number };
    const payoutData = payout as PayoutRow;

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
    const { data: updatedPayout, error } = await supabase
      .from("payouts")
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
      actor_role: user.role ?? "superadmin",
      action: "admin.payout.failed",
      entity_type: "payout",
      entity_id: id,
      metadata: { provider_id: payoutData.provider_id, amount: payoutData.amount, failure_reason: validationResult.data.failure_reason },
    });

    try {
      const { sendToUser } = await import("@/lib/notifications/onesignal");
      const { data: provider } = await supabase
        .from("providers")
        .select("user_id, business_name")
        .eq("id", payoutData.provider_id)
        .single();

      if (provider) {
        const providerRow = provider as { user_id?: string };
        const providerUserId = providerRow.user_id;
        const amountStr = payoutData.amount.toLocaleString();
        const reason = validationResult.data.failure_reason;
        if (providerUserId) {
          await sendToUser(
            providerUserId,
            {
              title: "Payout Failed",
              message: `Your payout of ZAR ${amountStr} could not be processed. Reason: ${reason}`,
              data: {
                type: "payout_failed",
                payout_id: id,
              },
              url: "/provider/finance",
            },
            ["push"],
            { appType: "provider" }
          );
          await supabase.from("notifications").insert({
            user_id: providerUserId,
            type: "system",
            title: "Payout Failed",
            message: `Your payout of ZAR ${amountStr} could not be processed. Reason: ${reason}`,
            data: { payout_id: id, amount: payoutData.amount, failure_reason: reason },
            action_url: "/provider/payouts",
          });
        }
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
