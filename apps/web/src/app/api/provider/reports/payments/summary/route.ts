import { NextRequest } from "next/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { MAX_REPORT_DAYS } from "@/lib/reports/constants";
import {
  filterLedgerRowsForLocation,
  getProviderReportContext,
  reportDateRangeFromParams,
  summarizeLedgerLocationAttribution,
} from "@/lib/reports/provider-report-utils";
import { isProviderEarningsRefundComponent } from "@/lib/ledger/refund-components";
import { providerNetAfterRefunds } from "@/lib/reports/provider-revenue-semantics";

type FinanceRowFull = {
  transaction_type: string;
  amount: number;
  net: number;
  booking_id: string | null;
  product_order_id: string | null;
  created_at: string;
  refund_component?: string | null;
};

type LedgerParts = { payment: number; wallet: number; gift: number; additional: number };

/** Paystack / Yoco / card terminal — booking may also have wallet_payment + gift_card_payment rows (split). */
function isGatewayCardCaptureProvider(provider: string | null | undefined): boolean {
  const p = (provider || "").toLowerCase();
  return p === "paystack" || p === "yoco" || p === "stripe" || p === "card";
}

/**
 * Customer funds represented in finance_transactions without double-counting:
 * - Split Paystack/Yoco: sum payment + wallet_payment + gift_card_payment (+ additional_charge_payment).
 * - Wallet / gift-card-only settlement: wallet + gift rows carry customer cash; `payment` rows are commission-base
 *   allocation — omit `payment` when wallet/gift rows exist and there was no card capture.
 */
function sumBookingCustomerFunds(parts: LedgerParts, hasGatewayCardCapture: boolean): number {
  if (hasGatewayCardCapture) {
    return parts.payment + parts.wallet + parts.gift + parts.additional;
  }
  if (parts.wallet > 0 || parts.gift > 0) {
    return parts.wallet + parts.gift + parts.additional;
  }
  return parts.payment + parts.additional;
}

function computeCustomerFundsSettledFromLedger(
  financeRows: FinanceRowFull[],
  bookingIdsWithGatewayCardCapture: Set<string>,
): number {
  const map = new Map<string, LedgerParts>();
  for (const r of financeRows) {
    if (!r.booking_id) continue;
    const cur = map.get(r.booking_id) ?? { payment: 0, wallet: 0, gift: 0, additional: 0 };
    const amt = Number(r.amount ?? 0);
    if (r.transaction_type === "payment") cur.payment += amt;
    else if (r.transaction_type === "wallet_payment") cur.wallet += amt;
    else if (r.transaction_type === "gift_card_payment") cur.gift += amt;
    else if (r.transaction_type === "additional_charge_payment") cur.additional += amt;
    map.set(r.booking_id, cur);
  }
  let total = 0;
  for (const [bid, parts] of map) {
    total += sumBookingCustomerFunds(parts, bookingIdsWithGatewayCardCapture.has(bid));
  }
  for (const r of financeRows) {
    if (r.booking_id) continue;
    const amt = Number(r.amount ?? 0);
    if (
      r.transaction_type === "payment" ||
      r.transaction_type === "wallet_payment" ||
      r.transaction_type === "gift_card_payment" ||
      r.transaction_type === "additional_charge_payment"
    ) {
      total += amt;
    }
  }
  return total;
}

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
    const reportContext = await getProviderReportContext(supabaseAdmin, providerId);
    const { data: providerTenantRow } = await supabaseAdmin
      .from("providers")
      .select("tenant_id")
      .eq("id", providerId)
      .maybeSingle();
    const providerTenantId =
      (providerTenantRow as { tenant_id?: string | null } | null)?.tenant_id ?? null;

    const searchParams = request.nextUrl.searchParams;
    const { fromDate, toDate } = reportDateRangeFromParams(searchParams, reportContext.timezone, {
      defaultDays: 30,
      maxDays: MAX_REPORT_DAYS,
    });
    const locationId = searchParams.get("location_id") || undefined;

    // ── 1. Bookings in period (for payment_status + wallet_amount aggregates) ──
    let bookingsQuery = supabaseAdmin
      .from("bookings")
      .select(
        "id, total_amount, total_paid, wallet_amount, payment_status, payment_provider, currency, scheduled_at"
      )
      .eq("provider_id", providerId)
      .gte("scheduled_at", fromDate.toISOString())
      .lte("scheduled_at", toDate.toISOString())
      .not("status", "eq", "cancelled");

    if (locationId) {
      bookingsQuery = bookingsQuery.eq("location_id", locationId);
    }

    const { data: bookings } = await bookingsQuery;

    const bookingIds = (bookings ?? []).map((b) => b.id);

    // ── 2. Finance transactions settled in the period (authoritative ledger) ──
    const { data: ft } = await supabaseAdmin
      .from("finance_transactions")
      .select("transaction_type, amount, net, booking_id, product_order_id, created_at, refund_component")
      .eq("provider_id", providerId)
      .gte("created_at", fromDate.toISOString())
      .lte("created_at", toDate.toISOString());
    const ledgerLocationAttribution = summarizeLedgerLocationAttribution(
      (ft ?? []) as FinanceRowFull[],
      locationId,
    );
    const financeRows = await filterLedgerRowsForLocation(
      supabaseAdmin,
      providerId,
      (ft ?? []) as FinanceRowFull[],
      locationId,
    );

    const ledgerBookingIds = [...new Set(financeRows.map((r) => r.booking_id).filter(Boolean))] as string[];
    const bookingIdsForPt = [...new Set([...bookingIds, ...ledgerBookingIds])];

    // ── 3. Payment transactions (gateway + no-gateway settlements) ──
    let paymentTxRows: Array<{ provider: string; amount: number; net_amount: number; status: string; booking_id: string | null; metadata: Record<string, unknown> | null }> = [];
    if (bookingIdsForPt.length > 0) {
      const { data: pt } = await supabaseAdmin
        .from("payment_transactions")
        .select("provider, amount, net_amount, status, booking_id, metadata")
        .in("booking_id", bookingIdsForPt)
        .eq("status", "success");
      paymentTxRows = (pt ?? []) as typeof paymentTxRows;
    }

    const bookingIdsWithGatewayCardCapture = new Set<string>();
    for (const pt of paymentTxRows) {
      if (!pt.booking_id) continue;
      if (isGatewayCardCaptureProvider(pt.provider)) bookingIdsWithGatewayCardCapture.add(pt.booking_id);
    }

    // ── Aggregate metrics ──
    type BookingRow = { id: string; total_amount?: number; total_paid?: number; wallet_amount?: number; payment_status?: string; payment_provider?: string; currency?: string; scheduled_at?: string };
    const rows = (bookings ?? []) as BookingRow[];

    // GMV = total booking value (all non-cancelled bookings regardless of payment status)
    const gmv = rows.reduce((s, b) => s + Number(b.total_amount ?? 0), 0);

    // Raw ledger-type sums (audit / reconciliation — not always additive; see settledLedgerAmount).
    const totalPaidFromGateway = financeRows
      .filter((r) => r.transaction_type === "payment")
      .reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const totalWalletApplied = financeRows
      .filter((r) => r.transaction_type === "wallet_payment")
      .reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const totalGiftCardApplied = financeRows
      .filter((r) => r.transaction_type === "gift_card_payment")
      .reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const totalAdditionalChargePayments = financeRows
      .filter((r) => r.transaction_type === "additional_charge_payment")
      .reduce((s, r) => s + Number(r.amount ?? 0), 0);

    const settledLedgerAmount = computeCustomerFundsSettledFromLedger(
      financeRows,
      bookingIdsWithGatewayCardCapture,
    );

    // Revenue breakdown by payment method (from payment_transactions)
    const byMethod: Record<string, { count: number; amount: number }> = {};
    paymentTxRows.forEach((pt) => {
      const method = pt.provider || "unknown";
      if (!byMethod[method]) byMethod[method] = { count: 0, amount: 0 };
      byMethod[method].count += 1;
      byMethod[method].amount += Number(pt.amount ?? 0);
    });
    // Booking.wallet_amount: split Paystack+wallet has no separate PT row for wallet — add from booking.
    // Wallet/gift-only settlements already have a payment_transactions row (internal ref); do not add twice.
    const walletBookings = rows.filter((b) => Number(b.wallet_amount ?? 0) > 0);
    if (walletBookings.length > 0) {
      if (!byMethod["wallet"]) byMethod["wallet"] = { count: 0, amount: 0 };
      walletBookings.forEach((b) => {
        const hasGatewayPt = paymentTxRows.some(
          (pt) => pt.booking_id === b.id && isGatewayCardCaptureProvider(pt.provider),
        );
        const hasInternalSettlementPt = paymentTxRows.some((pt) => {
          if (pt.booking_id !== b.id) return false;
          const p = (pt.provider || "").toLowerCase();
          return p === "wallet" || p === "gift_card" || p === "wallet_and_gift_card";
        });
        if (hasInternalSettlementPt && !hasGatewayPt) return;

        if (Number(b.total_paid ?? 0) === 0) {
          byMethod["wallet"].count += 1;
        }
        byMethod["wallet"].amount += Number(b.wallet_amount ?? 0);
      });
    }
    const customerPaymentsByMethodTotal = Object.values(byMethod).reduce((sum, d) => sum + d.amount, 0);
    const paymentsByMethod = Object.entries(byMethod)
      .map(([method, d]) => ({
        method,
        count: d.count,
        amount: d.amount,
        percentage: customerPaymentsByMethodTotal > 0 ? (d.amount / customerPaymentsByMethodTotal) * 100 : 0,
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

    // Platform Fee (platform revenue; legacy rows may still be transaction_type=service_fee)
    const serviceFeeCollected = financeRows
      .filter((r) => r.transaction_type === "platform_fee" || r.transaction_type === "service_fee")
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
    const gatewayChargeCount = paymentTxRows.filter((pt) => isGatewayCardCaptureProvider(pt.provider)).length;
    const successfulPayments = paymentTxRows.length;
    const totalPayments = rows.filter((b) => b.payment_status !== "pending").length;
    const pendingPayments = rows.filter((b) => b.payment_status === "pending").length;
    const failedPayments = rows.filter((b) => b.payment_status === "failed").length;

    // Refunds (finance_transactions refund rows). The trigger splits a refund into
    // per-component rows; only provider-affecting components reduce the provider's
    // earnings. Platform fee/commission, tax, discount contras and wallet/gift tender
    // legs are excluded so providerNetActivity is not over-clawed.
    const refundedAmount = financeRows
      .filter((r) => r.transaction_type === "refund" && isProviderEarningsRefundComponent(r.refund_component))
      .reduce((s, r) => s + Math.abs(Number(r.net ?? r.amount ?? 0)), 0);
    const providerEarningsReversals = financeRows
      .filter((r) => r.transaction_type === "provider_earnings" && Number(r.net ?? r.amount ?? 0) < 0)
      .reduce((s, r) => s + Math.abs(Number(r.net ?? r.amount ?? 0)), 0);
    // Single source of truth: recognized provider revenue (incl. walk-in add-ons) net of
    // provider refund clawbacks. Keeps this report reconciled with the dashboard,
    // business overview and sales history. See provider-revenue-semantics.ts.
    const providerNetActivity = providerNetAfterRefunds(financeRows);

    const averageTransactionValue = totalPayments > 0 ? gmv / totalPayments : 0;
    const averageBookedValueNonPending = averageTransactionValue;
    const refundRate = settledLedgerAmount > 0 ? (refundedAmount / settledLedgerAmount) * 100 : 0;

    const reportBasis =
      "Bookings use appointment scheduled dates; ledger rows use settlement timestamps (both in provider timezone). " +
      "Customer funds settled sums finance_transactions without double-counting wallet-only ledger flows.";

    // Walk-in / cash / "other" booking_payments often have no matching `finance_transactions`
    // row (documented gap vs Paystack webhook flow). Surface for provider reconciliation.
    let cashStylePaymentsWithoutLedgerCount = 0;
    let cashStylePaymentsWithoutLedgerAmount = 0;
    {
      let bpQuery = supabaseAdmin
        .from("booking_payments")
        .select("booking_id, amount, payment_method")
        .eq("status", "completed")
        .gte("created_at", fromDate.toISOString())
        .lte("created_at", toDate.toISOString())
        .in("payment_method", ["cash", "other"]);
      if (providerTenantId) {
        bpQuery = bpQuery.eq("tenant_id", providerTenantId);
      }
      const { data: bpOffline } = await bpQuery;
      const bpList = (bpOffline ?? []) as Array<{ booking_id: string; amount?: number }>;
      const candidateIds = [...new Set(bpList.map((r) => r.booking_id))];
      if (candidateIds.length > 0) {
        let bq = supabaseAdmin
          .from("bookings")
          .select("id")
          .eq("provider_id", providerId)
          .in("id", candidateIds);
        if (locationId) {
          bq = bq.eq("location_id", locationId);
        }
        const { data: allowedBookings } = await bq;
        const allowed = new Set((allowedBookings ?? []).map((b: { id: string }) => b.id));
        const scopedBp = bpList.filter((r) => allowed.has(r.booking_id));
        const scopedBookingIds = [...new Set(scopedBp.map((r) => r.booking_id))];
        if (scopedBookingIds.length > 0) {
          const { data: ftPay } = await supabaseAdmin
            .from("finance_transactions")
            .select("booking_id")
            .eq("provider_id", providerId)
            .eq("transaction_type", "payment")
            .in("booking_id", scopedBookingIds);
          const withLedger = new Set(
            (ftPay ?? []).map((r: { booking_id: string | null }) => r.booking_id).filter(Boolean) as string[],
          );
          for (const row of scopedBp) {
            if (!withLedger.has(row.booking_id)) {
              cashStylePaymentsWithoutLedgerCount += 1;
              cashStylePaymentsWithoutLedgerAmount += Number(row.amount ?? 0);
            }
          }
        }
      }
    }

    return successResponse({
      // Core metrics
      gmv,
      grossBookedValue: gmv,
      settledLedgerAmount,
      customerPaymentsByMethodTotal,
      providerNetActivity,
      refundedAmount,
      providerEarningsReversals,
      providerEarnings,
      serviceFeeCollected,
      tipsCollected,
      travelFeesCollected,
      taxCollected,
      cancellationFeesRetained,
      promotionDiscountsGiven,
      // Breakdown of how "totalCollected" is composed
      collectionBreakdown: {
        ledger_payment_amount: totalPaidFromGateway,
        wallet: totalWalletApplied,
        gift_card: totalGiftCardApplied,
        additional_charge_payment: totalAdditionalChargePayments,
      },
      basis: {
        grossBookedValue: "Non-cancelled bookings scheduled in the selected provider-timezone period.",
        settledLedgerAmount:
          "Customer funds from finance_transactions in the settlement window: Paystack/Yoco splits sum payment + wallet + gift card (+ additional charges); wallet/gift-only bookings count wallet/gift rows only (payment rows there allocate commission, not extra customer cash).",
        customerPaymentsByMethodTotal:
          "Successful payment_transactions plus wallet portions from split bookings where wallet is not duplicated by an internal wallet-settlement row.",
        providerEarnings:
          "Provider_earnings ledger net created in the selected period; may differ from gross collected cash.",
        providerNetActivity:
          "Provider earnings plus tips, travel, and cancellation fees, less refund ledger rows in the selected period.",
        location:
          locationId
            ? ledgerLocationAttribution.note
            : "All provider locations and provider-level ledger rows.",
      },
      locationAttribution: ledgerLocationAttribution,
      reportBasis,
      timezone: reportContext.timezone,
      // Booking counts
      totalPayments,
      successfulPayments,
      gatewayChargeCount,
      pendingPayments,
      // Legacy-compatible fields (kept for backward compat with existing portal UI)
      totalAmount: gmv,
      totalCollected: settledLedgerAmount,
      netAmount: providerNetActivity,
      averageTransactionValue,
      averageBookedValueNonPending,
      refundRate,
      paymentsByMethod,
      paymentsByStatus,
      // Payment-status breakdown
      failedPayments,
      cashStylePaymentsWithoutLedgerCount,
      cashStylePaymentsWithoutLedgerAmount,
    });
  } catch (error) {
    console.error("Error in payment summary report:", error);
    return handleApiError(error, "Failed to generate payment summary report");
  }
}
