import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { writeAuditLog } from "@/lib/audit/audit";
import { recordPayoutLedger } from "@/lib/provider/record-payout-ledger";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { fetchProviderInAdminTenant } from "@/lib/tenant/admin-booking-tenant";
import { formatCurrency } from "@/lib/utils";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { enforcePeriodLock } from "@/lib/finance/period-lock";

/**
 * POST /api/admin/payouts/[id]/mark-paid
 * 
 * Mark a payout as paid
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
      id: string;
      net_amount?: number;
      payout_number?: string;
      currency?: string | null;
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
            message: "Payout is already marked as paid",
            code: "ALREADY_PAID",
          },
        },
        { status: 400 }
      );
    }

    // §Release-audit 2026-04: only `processing` payouts can be marked paid.
    // The `payout_status` enum is `pending | processing | completed | failed`
    // — there is no "approved" state — so the previous list including
    // "approved" had a dead branch and a misleading error message. Pending
    // requests must be approved first (which moves them to processing); we
    // also reject `failed` because re-paying a failed payout requires a new
    // request, not a flip from this endpoint.
    if (payoutData.status !== "processing") {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: `Cannot mark payout as paid when status is "${payoutData.status}". Only payouts in the "processing" state (i.e. already approved by an admin) can be marked paid.`,
            code: "INVALID_STATUS_TRANSITION",
          },
        },
        { status: 400 }
      );
    }

    // Period lock guard — prevent marking payouts paid in locked accounting periods
    const lockGuard = await enforcePeriodLock(supabase, tenantId, new Date().toISOString());
    if (lockGuard) return lockGuard;

    // Wave 1.4 (audit 2026-04 final 100/100): MONEY-SAFE ORDERING.
    //
    // Previously: flip `payouts.status='completed'` first, then attempt
    // `recordPayoutLedger`. If the ledger insert failed (transient DB
    // error, period-lock race, network blip, etc.) we logged and
    // swallowed it — leaving the payout marked paid but with no
    // `finance_transactions` row of type 'payout'. That drift broke
    // `getAvailablePayoutBalance` (the next payout could pay the same
    // money twice) and silently failed reconciliation.
    //
    // New ordering: write the ledger row first. If the ledger fails we
    // refuse the status flip (safe: payout stays in `processing`, admin
    // can retry — `recordPayoutLedger` is idempotent on `payout_id`). If
    // the status flip later fails we've already recorded the liability
    // reduction; the next retry is a no-op insert + the status flip.
    try {
      await recordPayoutLedger(supabase, {
        id: payoutData.id,
        provider_id: payoutData.provider_id,
        net_amount: payoutData.net_amount,
        amount: payoutData.amount,
        payout_number: payoutData.payout_number,
      });
    } catch (ledgerErr) {
      console.error(
        "[admin/payouts/mark-paid] Refusing status flip — finance ledger insert failed:",
        ledgerErr,
      );
      try {
        const { captureException } = await import("@sentry/nextjs");
        captureException(ledgerErr, {
          tags: {
            surface: "admin.payouts.mark_paid",
            payout_id: id,
            provider_id: payoutData.provider_id,
          },
          level: "error",
        });
      } catch {
        // Sentry is best effort
      }
      return NextResponse.json(
        {
          data: null,
          error: {
            message:
              "Failed to record payout in the finance ledger. The payout has NOT been marked paid. Please retry; if the problem persists, contact engineering.",
            code: "LEDGER_WRITE_FAILED",
          },
        },
        { status: 500 }
      );
    }

    // Update payout status
    const { data: updatedPayout, error } = await supabase
      .from("payouts")
      .update({
        status: "completed",
        processed_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
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
      action: "admin.payout.paid",
      entity_type: "payout",
      entity_id: id,
      metadata: { provider_id: payoutData.provider_id, amount: payoutData.amount },
    });

    try {
      const { notifyProviderPayoutProcessed } = await import("@/lib/notifications/notification-service");
      await notifyProviderPayoutProcessed(
        payoutData.provider_id,
        Number(payoutData.amount),
        new Date(),
        payoutData.payout_number || id,
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
        if (providerUserId) {
          await sendToUser(
            providerUserId,
            {
              title: "Payout Processed",
              message: `Your payout of ${amountFormatted} has been processed and paid.`,
              data: {
                type: "payout_paid",
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
            title: "Payout Processed",
            message: `Your payout of ${amountFormatted} has been processed and paid.`,
            data: { payout_id: id, amount: payoutData.amount },
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
    console.error("Unexpected error in /api/admin/payouts/[id]/mark-paid:", error);
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
