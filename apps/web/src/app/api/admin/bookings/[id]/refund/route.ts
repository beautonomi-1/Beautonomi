import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError, errorResponse  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@/lib/admin-sections";
import { writeAuditLog } from "@/lib/audit/audit";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { fetchBookingInAdminTenant } from "@/lib/tenant/admin-booking-tenant";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";
import { getTenantLocaleTagFromRegionConfig } from "@/lib/locale/tenant-locale";
import { enforcePeriodLock } from "@/lib/finance/period-lock";

/**
 * POST /api/admin/bookings/[id]/refund
 *
 * Process a refund for a booking. Refunds always credit the customer's wallet
 * (use for next booking or request payout). Uses booking_refunds so
 * update_booking_payment_status trigger keeps totals in sync.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_PROVIDERS_OPERATIONS, request);
    if (!user) throw new Error("Authentication required");
    const { id } = await params;
    const supabase = getSupabaseAdmin();
    if (!supabase) throw new Error("Admin client unavailable");
    const body = await request.json();

    const { amount, reason } = body;

    if (!amount || amount <= 0) {
      return errorResponse("Invalid refund amount", "VALIDATION_ERROR", 400);
    }

    const tenantId = await resolveAdminApiTenantId(request);
    const loaded = await fetchBookingInAdminTenant(
      supabase,
      id,
      tenantId,
      "id, total_amount, total_paid, total_refunded, customer_id, booking_number, currency, payment_status, tenant_id, provider_id"
    );
    if ("error" in loaded) return loaded.error;

    const effectiveTenantId =
      (loaded.booking as { tenant_id?: string | null }).tenant_id ?? tenantId;
    const tenantRegion = effectiveTenantId ? await getTenantRegionConfig(effectiveTenantId) : null;
    const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;
    const adminRefundLocale = getTenantLocaleTagFromRegionConfig(tenantRegion);

    const b = loaded.booking as {
      total_amount: number;
      total_paid?: number;
      total_refunded?: number;
      payment_status?: string;
      customer_id: string;
      booking_number: string;
      currency?: string;
      provider_id?: string | null;
    };

    if (b.payment_status !== "paid" && b.payment_status !== "partially_paid") {
      return errorResponse("Can only refund paid or partially paid bookings", "INVALID_STATUS", 400);
    }

    const availableForRefund = (b.total_paid ?? 0) - (b.total_refunded ?? 0);
    if (amount > availableForRefund) {
      const displayCurrency = b.currency || lastResortCurrency;
      const fmtAvail = new Intl.NumberFormat(adminRefundLocale, {
        style: "currency",
        currency: displayCurrency,
      }).format(availableForRefund);
      return errorResponse(
        `Refund amount exceeds available refund amount (${fmtAvail})`,
        "VALIDATION_ERROR",
        400
      );
    }

    const financeTenantId = await resolveTenantIdForFinanceLedger(supabase, {
      tenant_id: (loaded.booking as { tenant_id?: string | null }).tenant_id ?? tenantId,
      provider_id: b.provider_id ?? null,
    });
    const lockGuard = await enforcePeriodLock(supabase, financeTenantId, new Date().toISOString());
    if (lockGuard) return lockGuard;

    // 1. Credit customer wallet (refunds always go to wallet)
    const rpc = supabase.rpc.bind(supabase) as unknown as (name: string, args: Record<string, unknown>) => Promise<{ error: unknown }>;
    const { error: walletError } = await rpc("wallet_credit_admin", {
      p_user_id: b.customer_id,
      p_amount: amount,
      p_currency: b.currency || lastResortCurrency,
      p_description: `Refund for booking ${b.booking_number}: ${reason || "Admin refund"}`,
      p_reference_id: id,
      p_reference_type: "booking_refund",
      p_tenant_id: financeTenantId,
    });

    if (walletError) {
      console.error("Wallet credit failed:", walletError);
      return errorResponse("Failed to credit customer wallet", "WALLET_ERROR", 500);
    }

    // 2. Create refund record in booking_refunds (triggers update_booking_payment_status)
    const { data: refund, error: refundError } = await supabase
      .from("booking_refunds")
      .insert({
        booking_id: id,
        amount,
        reason: reason || "Admin refund",
        refund_method: "store_credit",
        status: "completed",
        created_by: user.id,
      })
      .select()
      .single();

    if (refundError || !refund) {
      return handleApiError(refundError, "Failed to create refund");
    }

    await supabase.from("finance_transactions").insert({
      tenant_id: financeTenantId,
      booking_id: id,
      provider_id: b.provider_id ?? null,
      transaction_type: "refund",
      amount: -amount,
      fees: 0,
      commission: 0,
      net: -amount,
      description: `Refund for booking ${b.booking_number}: ${reason || "Admin refund"}`,
      created_at: new Date().toISOString(),
    });

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: (user as { role?: string }).role || "superadmin",
      action: "admin.refund.create",
      entity_type: "refund",
      entity_id: (refund as { id: string }).id,
      metadata: { booking_id: id, amount, reason, wallet_credit: true },
    });

    if (amount >= b.total_amount) {
      await supabase
        .from("bookings")
        .update({
          status: "cancelled",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
    }

    try {
      const { sendToUser } = await import("@/lib/notifications/onesignal");
      await sendToUser(
        b.customer_id,
        {
          title: "Refund added to wallet",
          message: `A refund of ${b.currency || lastResortCurrency} ${amount.toFixed(2)} for booking ${b.booking_number} has been added to your wallet. Use it for your next booking or request a payout.`,
          data: { type: "refund_processed", booking_id: id, refund_id: (refund as { id: string }).id },
          url: "/account-settings/wallet",
        },
        ["push"],
        { appType: "customer" }
      );
    } catch (notifError) {
      console.error("Error sending notification:", notifError);
    }

    return successResponse(refund);
  } catch (error) {
    return handleApiError(error, "Failed to process refund");
  }
}
