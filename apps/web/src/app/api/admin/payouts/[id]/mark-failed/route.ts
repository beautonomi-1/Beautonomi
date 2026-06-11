import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit/audit";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { fetchProviderInAdminTenant } from "@/lib/tenant/admin-booking-tenant";
import { formatCurrency } from "@/lib/utils";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { slackNotifyPayoutFailed } from "@/lib/integrations/slack/finance-triggers";

const markFailedSchema = z.object({
  failure_reason: z.string().min(1, "Failure reason is required"),
});

function getPaystackTransferStatus(response: unknown): string | null {
  if (!response || typeof response !== "object") return null;
  const record = response as Record<string, unknown>;
  const nested = record.data;
  if (nested && typeof nested === "object") {
    const status = (nested as Record<string, unknown>).status;
    if (typeof status === "string") return status;
  }
  return typeof record.status === "string" ? record.status : null;
}

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
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

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

    type PayoutRow = {
      status: string;
      provider_id: string;
      amount: number;
      currency?: string | null;
      transfer_code?: string | null;
      payout_provider_response?: unknown;
    };
    const payoutData = payout as PayoutRow;
    const payoutCurrency = payoutData.currency?.trim() || LAST_RESORT_CURRENCY;
    const amountFormatted = formatCurrency(Number(payoutData.amount), payoutCurrency);

    const prov = await fetchProviderInAdminTenant(supabase, payoutData.provider_id, tenantId, "id");
    if ("error" in prov) {
      const st = prov.error.status;
      return NextResponse.json(
        {
          data: null,
          error: {
            message: st === 403 ? "Payout belongs to another market" : "Provider not found",
            code: st === 403 ? "TENANT_MISMATCH" : "NOT_FOUND",
          },
        },
        { status: st }
      );
    }

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

    const transferStatus = getPaystackTransferStatus(payoutData.payout_provider_response);
    // Block mark-failed only when a transfer is actively in-flight (pending/success).
    // Allow it when:
    //   - no transfer_code: nothing was sent to Paystack
    //   - status is "failed" / "reversed": Paystack already rejected it
    //   - status is "otp": transfer is stuck waiting for OTP — admin override escape hatch
    if (
      payoutData.transfer_code &&
      transferStatus !== "failed" &&
      transferStatus !== "reversed" &&
      transferStatus !== "otp"
    ) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message:
              "A Paystack transfer is actively in flight for this payout. Wait for Paystack to settle, fail, or reverse it before marking it failed here.",
            code: "TRANSFER_IN_FLIGHT",
          },
        },
        { status: 409 }
      );
    }

    // Update payout status (optimistic lock: only if status unchanged since read)
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
      .eq("status", payoutData.status)
      .select()
      .maybeSingle();

    if (error) {
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
    if (!updatedPayout) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Payout was already processed by another admin",
            code: "STATE_CONFLICT",
          },
        },
        { status: 409 }
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
      const { notifyProviderPayoutFailed } = await import("@/lib/notifications/notification-service");
      await notifyProviderPayoutFailed(
        payoutData.provider_id,
        Number(payoutData.amount),
        validationResult.data.failure_reason,
      );
    } catch (templateErr) {
      console.warn("Template notification failed, falling back to inline:", templateErr);
    }

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
        const reason = validationResult.data.failure_reason;
        if (providerUserId) {
          await sendToUser(
            providerUserId,
            {
              title: "Payout Failed",
              message: `Your payout of ${amountFormatted} could not be processed. Reason: ${reason}`,
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
            message: `Your payout of ${amountFormatted} could not be processed. Reason: ${reason}`,
            data: { payout_id: id, amount: payoutData.amount, failure_reason: reason },
            action_url: "/provider/payouts",
          });
        }
      }
    } catch (notifError) {
      console.error("Error sending notification:", notifError);
    }

    void slackNotifyPayoutFailed(request, {
      id,
      provider_id: payoutData.provider_id,
      amount: payoutData.amount,
      currency: payoutData.currency,
      failure_reason: validationResult.data.failure_reason,
    });

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
