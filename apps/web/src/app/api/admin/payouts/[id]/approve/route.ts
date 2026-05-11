import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, notFoundResponse, handleApiError, errorResponse  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { writeAuditLog } from "@/lib/audit/audit";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { fetchProviderInAdminTenant } from "@/lib/tenant/admin-booking-tenant";
import { formatCurrency } from "@/lib/utils";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { validateAdminPayoutReadiness } from "@/lib/admin/validate-provider-payout-readiness";

/**
 * POST /api/admin/payouts/[id]/approve
 * 
 * Approve a payout request
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    if (!user) throw new Error("Authentication required");
    const { id } = await params;
    const supabase = getSupabaseAdmin();
    if (!supabase) throw new Error("Admin client unavailable");
    const body = await request.json();
    const tenantId = await resolveAdminApiTenantId(request);

    const { data: payout } = await supabase
      .from("payouts")
      .select("id, status, provider_id, amount, currency, payout_account_details")
      .eq("id", id)
      .single();

    if (!payout) {
      return notFoundResponse("Payout not found");
    }

    type PayoutRow = {
      status: string;
      provider_id?: string;
      amount: number;
      currency?: string | null;
      payout_account_details?: { bank_account_id?: string | null } | null;
    };
    const payoutRow = payout as PayoutRow;
    const payoutCurrency = payoutRow.currency?.trim() || LAST_RESORT_CURRENCY;
    const amountFormatted = formatCurrency(Number(payoutRow.amount), payoutCurrency);
    if (payoutRow.provider_id) {
      const prov = await fetchProviderInAdminTenant(supabase, payoutRow.provider_id, tenantId, "id");
      if ("error" in prov) return prov.error;
    }
    if (payoutRow.status !== "pending") {
      return errorResponse("Payout is not pending", "INVALID_STATE", 400);
    }

    if (payoutRow.provider_id) {
      const readiness = await validateAdminPayoutReadiness({
        supabase,
        providerId: payoutRow.provider_id,
        tenantId,
        requestedAccountId: payoutRow.payout_account_details?.bank_account_id ?? null,
        requireAccount: true,
      });
      if (readiness.ok === false) {
        return errorResponse(readiness.message, readiness.code, readiness.status);
      }
    }

    // Update payout status
    const { data: updatedPayout, error: updateError } = await supabase
      .from("payouts")
      .update({
        status: "processing",
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        admin_notes: body.notes || null,
      })
      .eq("id", id)
      .select(`
        *,
        provider:providers!payouts_provider_id_fkey(id, business_name, slug, user_id)
      `)
      .single();

    if (updateError || !updatedPayout) {
      return handleApiError(updateError, "Failed to approve payout");
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "admin.payout.approve",
      entity_type: "payout",
      entity_id: id,
      metadata: { provider_id: payoutRow.provider_id, amount: payoutRow.amount },
    });

    try {
      const { sendToUser } = await import("@/lib/notifications/onesignal");
      const updatedWithProvider = updatedPayout as PayoutRow & { provider?: { user_id?: string } };
      const providerData = updatedWithProvider.provider;
      if (providerData?.user_id) {
        await sendToUser(
          providerData.user_id,
          {
            title: "Payout Approved",
            message: `Your payout request of ${amountFormatted} has been approved and is being processed.`,
            data: {
              type: "payout_approved",
              payout_id: id,
            },
            url: `/provider/finance`,
          },
          ["push"],
          { appType: "provider" }
        );
        await supabase.from("notifications").insert({
          user_id: providerData.user_id,
          type: "system",
          title: "Payout Approved",
          message: `Your payout request of ${amountFormatted} has been approved and is being processed.`,
          data: { payout_id: id, amount: payoutRow.amount },
          action_url: "/provider/payouts",
        });
      }
    } catch (notifError) {
      console.error("Error sending notification:", notifError);
    }

    return successResponse(updatedPayout);
  } catch (error) {
    return handleApiError(error, "Failed to approve payout");
  }
}
