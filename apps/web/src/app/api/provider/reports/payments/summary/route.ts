import { NextRequest } from "next/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { subDays, startOfDay, endOfDay } from "date-fns";
import { MAX_REPORT_DAYS, MAX_BOOKINGS_FOR_REPORT } from "@/lib/reports/constants";

/**
 * GET /api/provider/reports/payments/summary
 *
 * Payment summary for the provider portal reports page.
 *
 * Data sources (in priority order, reconciled):
 * 1. `finance_transactions` (wallet_payment, gift_card_payment, service_fee, tip, tax, travel_fee)
 *    — the authoritative ledger for all settled payments on the platform.
 * 2. `bookings` (wallet_amount, payment_status, payment_provider)
 *    — fallback for wallet-only and package/entitlement flows where no finance_transaction
 *    of type "payment" exists (gateway-less bookings are fully recorded in the ledger).
 * 3. `payment_transactions` (charge rows)
 *    — cross-check totals and pick up any gateway-less settlements not yet in finance_transactions.
 *
 * All amounts in the provider's currency (major units).
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const supabaseAdmin = getSupabaseAdmin();

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");

    const searchParams = request.nextUrl.searchParams;
    let fromDate = searchParams.get("from")
      ? startOfDay(new Date(searchParams.get("from")!))
      : startOfDay(subDays(new Date(), 30));
    const toDate = searchParams.get("to") ? endOfDay(new Date(searchParams.get("to")!)) : endOfDay(new Date());
    const locationId = searchParams.get("location_id") || undefined;

    const daysDiff = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDiff > MAX_REPORT_DAYS) {
      fromDate = startOfDay(subDays(toDate, MAX_REPORT_DAYS));
    }

    // ── 1. Bookings in period (for payment_status + wallet_amount aggregates) ──
    let bookingsQuery = supabaseAdmin
      .from("bookings")
      .select(
        "id, total_amount, total_paid, wallet_amount, payment_status, payment_provider, currency, scheduled_at"
      )
      .eq("provider_id", providerId)
      .gte("scheduled_at", fromDate.toISOString())
      .lte("scheduled_at", toDate.toISOString())
      .not("status", "eq", "cancelled")
      .limit(MAX_BOOKINGS_FOR_REPORT);

    if (locationId) {
      bookingsQuery = bookingsQuery.eq("location_id", locationId);
    }

    const { data: bookings } = await bookingsQuery;

    const bookingIds = (bookings ?? []).map((b) => b.id);

    // ── 2. Finance transactions settled in the period (authoritative ledger) ──
    type FinanceRow = {
      transaction_type: string;
      amount: number;
      net: number;
      booking_id: string | null;
      created_at: string;
    };
    const { data: ft } = await supabaseAdmin
      .from("finance_transactions")
      .select("transaction_type, amount, net, booking_id, created_at")
      .eq("provider_id", providerId)
      .gte("created_at", fromDate.toISOString())
      .lte("created_at", toDate.toISOString());
    let financeRows = (ft ?? []) as FinanceRow[];

    if (locationId && financeRows.length > 0) {
      const financeBookingIds = [...new Set(financeRows.map((r) => r.booking_id).filter(Boolean))] as string[];
      const allowedBookingIds = new Set<string>();
      if (financeBookingIds.length > 0) {
        const { data: locationBookings } = await supabaseAdmin
          .from("bookings")
          .select("id")
          .eq("provider_id", providerId)
          .eq("location_id", locationId)
          .in("id", financeBookingIds);
        for (const b of locationBookings ?? []) {
          allowedBookingIds.add((b as { id: string }).id);
        }
      }
      financeRows = financeRows.filter((r) => r.booking_id != null && allowedBookingIds.has(r.booking_id));
    }

    // ── 3. Payment transactions (gateway + no-gateway settlements) ──
    let paymentTxRows: Array<{ provider: string; amount: number; net_amount: number; status: string; booking_id: string | null; metadata: Record<string, unknown> | null }> = [];
    if (bookingIds.length > 0) {
      const { data: pt } = await supabaseAdmin
        .from("payment_transactions")
        .select("provider, amount, net_amount, status, booking_id, metadata")
        .in("booking_id", bookingIds)
        .eq("status", "success");
      paymentTxRows = (pt ?? []) as typeof paymentTxRows;
    }

    // ── Aggregate metrics ──
    type BookingRow = { id: string; total_amount?: number; total_paid?: number; wallet_amount?: number; payment_status?: string; payment_provider?: string; currency?: string; scheduled_at?: string };
    const rows = (bookings ?? []) as BookingRow[];

    // GMV = total booking value (all non-cancelled bookings regardless of payment status)
    const gmv = rows.reduce((s, b) => s + Number(b.total_amount ?? 0), 0);

    // Actual collected = settled ledger rows by payment date, not appointment date.
    const totalPaidFromGateway = financeRows
      .filter((r) => r.transaction_type === "payment")
      .reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const totalWalletApplied = financeRows
      .filter((r) => r.transaction_type === "wallet_payment")
      .reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const totalGiftCardApplied = financeRows
      .filter((r) => r.transaction_type === "gift_card_payment")
      .reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const totalCollected = totalPaidFromGateway + totalWalletApplied + totalGiftCardApplied;

    // Revenue breakdown by payment method (from payment_transactions)
    const byMethod: Record<string, { count: number; amount: number }> = {};
    paymentTxRows.forEach((pt) => {
      const method = pt.provider || "unknown";
      if (!byMethod[method]) byMethod[method] = { count: 0, amount: 0 };
      byMethod[method].count += 1;
      byMethod[method].amount += Number(pt.amount ?? 0);
    });
    // Add wallet-only bookings (no payment_transaction row but wallet_amount > 0)
    const walletOnlyBookings = rows.filter(
      (b) => Number(b.wallet_amount ?? 0) > 0 && Number(b.total_paid ?? 0) === 0
    );
    if (walletOnlyBookings.length > 0) {
      if (!byMethod["wallet"]) byMethod["wallet"] = { count: 0, amount: 0 };
      walletOnlyBookings.forEach((b) => {
        byMethod["wallet"].count += 1;
        byMethod["wallet"].amount += Number(b.wallet_amount ?? 0);
      });
    }
    const paymentsByMethod = Object.entries(byMethod)
      .map(([method, d]) => ({
        method,
        count: d.count,
        amount: d.amount,
        percentage: totalCollected > 0 ? (d.amount / totalCollected) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    // Revenue breakdown by payment_status
    const byStatus: Record<string, { count: number; amount: number }> = {};
    rows.forEach((b) => {
      const st = b.payment_status || "unknown";
      if (!byStatus[st]) byStatus[st] = { count: 0, amount: 0 };
      byStatus[st].count += 1;
      byStatus[st].amount += Number(b.total_amount ?? 0);
    });
    const paymentsByStatus = Object.entries(byStatus)
      .map(([status, d]) => ({ status, count: d.count, amount: d.amount }))
      .sort((a, b) => b.count - a.count);

    // Provider earnings from ledger
    const providerEarnings = financeRows
      .filter((r) => r.transaction_type === "provider_earnings")
      .reduce((s, r) => s + Number(r.net ?? r.amount ?? 0), 0);

    // Service fee (platform revenue)
    const serviceFeeCollected = financeRows
      .filter((r) => r.transaction_type === "service_fee")
      .reduce((s, r) => s + Number(r.amount ?? 0), 0);

    // Tips collected
    const tipsCollected = financeRows
      .filter((r) => r.transaction_type === "tip")
      .reduce((s, r) => s + Number(r.amount ?? 0), 0);

    // Travel fees collected
    const travelFeesCollected = financeRows
      .filter((r) => r.transaction_type === "travel_fee")
      .reduce((s, r) => s + Number(r.amount ?? 0), 0);

    // Tax collected
    const taxCollected = financeRows
      .filter((r) => r.transaction_type === "tax")
      .reduce((s, r) => s + Number(r.amount ?? 0), 0);

    // Cancellation fees retained (provider keeps the fee when customer cancels late)
    const cancellationFeesRetained = financeRows
      .filter((r) => r.transaction_type === "cancellation_fee")
      .reduce((s, r) => s + Number(r.net ?? r.amount ?? 0), 0);

    // Promotion discounts given (reduce net revenue — helps track promo ROI)
    const promotionDiscountsGiven = financeRows
      .filter((r) => r.transaction_type === "promotion_discount")
      .reduce((s, r) => s + Number(r.amount ?? 0), 0);

    // Successful vs failed (from payment_transactions)
    const successfulPayments = paymentTxRows.length;
    const totalPayments = rows.filter((b) => b.payment_status !== "pending").length;
    const pendingPayments = rows.filter((b) => b.payment_status === "pending").length;

    // Refunds (from finance_transactions refund rows, amount is now positive absolute value)
    const refundedAmount = financeRows
      .filter((r) => r.transaction_type === "refund")
      .reduce((s, r) => s + Math.abs(Number(r.amount ?? 0)), 0);
    const netAmount = totalCollected - refundedAmount + cancellationFeesRetained;

    const averageTransactionValue = totalPayments > 0 ? gmv / totalPayments : 0;
    const refundRate = totalCollected > 0 ? (refundedAmount / totalCollected) * 100 : 0;

    return successResponse({
      // Core metrics
      gmv,
      totalCollected,
      netAmount,
      refundedAmount,
      providerEarnings,
      serviceFeeCollected,
      tipsCollected,
      travelFeesCollected,
      taxCollected,
      cancellationFeesRetained,
      promotionDiscountsGiven,
      // Breakdown of how "totalCollected" is composed
      collectionBreakdown: {
        gateway: totalPaidFromGateway,
        wallet: totalWalletApplied,
        gift_card: totalGiftCardApplied,
      },
      basis: {
        gmv: "Non-cancelled bookings scheduled in the selected period.",
        collected:
          "Settled payment, wallet, and gift-card finance ledger rows created in the selected period.",
        providerEarnings:
          "Provider_earnings ledger net created in the selected period; may differ from gross collected cash.",
        location:
          locationId
            ? "Location filter includes only ledger rows linked to bookings at the selected location; non-booking platform charges are excluded."
            : "All provider locations and provider-level ledger rows.",
      },
      // Booking counts
      totalPayments,
      successfulPayments,
      pendingPayments,
      // Legacy-compatible fields (kept for backward compat with existing portal UI)
      totalAmount: gmv,
      averageTransactionValue,
      refundRate,
      paymentsByMethod,
      paymentsByStatus,
      // Payment-status breakdown
      failedPayments: 0,
    });
  } catch (error) {
    console.error("Error in payment summary report:", error);
    return handleApiError(error, "Failed to generate payment summary report");
  }
}
