import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { requireProviderReportsAccess } from "@/lib/reports/require-provider-reports-access";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getProviderRevenue } from "@/lib/reports/revenue-helpers";
import { DASHBOARD_REVENUE_TRANSACTION_TYPES, MAX_FINANCE_TRANSACTIONS, MAX_REPORT_DAYS } from "@/lib/reports/constants";
import { fetchAllLedgerPages } from "@/lib/reports/fetch-all-ledger-pages";
import {
  filterLedgerRowsForLocation,
  getProviderReportContext,
  reportDateKey,
  reportDateRangeFromParams,
  summarizeLedgerLocationAttribution,
} from "@/lib/reports/provider-report-utils";
import { isCashRefundComponent } from "@/lib/ledger/refund-components";

export const maxDuration = 60;

const BATCH = 200;

/**
 * GET /api/provider/reports/payments/payouts
 *
 * **Payout earnings (ledger)** — net provider earnings from `finance_transactions`
 * (`provider_earnings` only for headline totals, consistent with dashboard revenue cards).
 *
 * The selected period applies to **ledger settlement timestamps** (`created_at`), not to
 * appointment `scheduled_at`. Bookings are loaded **by ID** when they appear on ledger rows,
 * so booked totals stay accurate even when the appointment was outside the filter window.
 */
export async function GET(request: NextRequest) {
  try {
    const permissionCheck = await requireProviderReportsAccess(request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabaseAdmin = getSupabaseAdmin();

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);

    if (!providerId) return notFoundResponse("Provider not found");
    const reportContext = await getProviderReportContext(supabaseAdmin, providerId);

    const searchParams = request.nextUrl.searchParams;
    const { fromDate, toDate, fromYmd, toYmd } = reportDateRangeFromParams(
      searchParams,
      reportContext.timezone,
      { defaultDays: 90, maxDays: MAX_REPORT_DAYS },
    );
    const locationId = searchParams.get("location_id") || undefined;

    const dashOpts = { transactionTypes: DASHBOARD_REVENUE_TRANSACTION_TYPES, timezone: reportContext.timezone };

    const {
      revenueByBooking,
      revenueByProductOrder,
      revenueByDate,
      latestSettlementAtByBooking,
      latestSettlementAtByProductOrder,
    } = await getProviderRevenue(supabaseAdmin, providerId, fromDate, toDate, locationId ?? null, dashOpts);

    const bookingIds = [...revenueByBooking.keys()];
    const bookingsById = new Map<
      string,
      { id: string; scheduled_at?: string; status?: string; total_amount?: number }
    >();

    for (let i = 0; i < bookingIds.length; i += BATCH) {
      const slice = bookingIds.slice(i, i + BATCH);
      let bq = supabaseAdmin
        .from("bookings")
        .select("id, scheduled_at, status, total_amount")
        .eq("provider_id", providerId)
        .in("id", slice);
      if (locationId) {
        bq = bq.eq("location_id", locationId);
      }
      const { data: rows } = await bq;
      for (const row of (rows ?? []) as Array<{ id: string; scheduled_at?: string; status?: string; total_amount?: number }>) {
        bookingsById.set(row.id, row);
      }
    }

    const productOrderIds = [...revenueByProductOrder.keys()];
    let productOrders: Array<{ id: string; total_amount?: number; created_at?: string }> = [];
    if (productOrderIds.length > 0) {
      for (let i = 0; i < productOrderIds.length; i += BATCH) {
        const slice = productOrderIds.slice(i, i + BATCH);
        const { data: orderRows } = await supabaseAdmin
          .from("product_orders")
          .select("id, total_amount, created_at")
          .eq("provider_id", providerId)
          .in("id", slice);
        productOrders.push(...((orderRows ?? []) as typeof productOrders));
      }
    }

    const feeQuery = supabaseAdmin
      .from("finance_transactions")
      .select("booking_id, product_order_id, transaction_type, amount, net, refund_component")
      .eq("provider_id", providerId)
      .in("transaction_type", ["platform_fee", "service_fee", "refund"])
      .gte("created_at", fromDate.toISOString())
      .lte("created_at", toDate.toISOString())
      .order("created_at", { ascending: true });

    const rawFeeRows = await fetchAllLedgerPages(
      feeQuery as Parameters<typeof fetchAllLedgerPages>[0],
      MAX_FINANCE_TRANSACTIONS,
    );
    const feeLocationAttribution = summarizeLedgerLocationAttribution(
      rawFeeRows as Array<{ booking_id: string | null; product_order_id: string | null }>,
      locationId,
    );
    const feeRows = await filterLedgerRowsForLocation(
      supabaseAdmin,
      providerId,
      rawFeeRows as Array<{
        booking_id: string | null;
        product_order_id: string | null;
        transaction_type: string;
        amount: number;
        net: number;
        refund_component: string | null;
      }>,
      locationId,
    );

    // Refunds here are netted against the GROSS booked amount, so we want the customer
    // cash refunded = |Σ net of the cash legs|. We sum the signed net of cash components
    // (they penny-balance to the refund) and abs at read time; the parallel discount/
    // tender contras (isCashRefundComponent === false) are excluded.
    const feeMap = new Map<string, { platformFee: number; refundNetSum: number }>();
    for (const row of feeRows ?? []) {
      const objectKey = row.booking_id
        ? `booking:${row.booking_id}`
        : row.product_order_id
          ? `order:${row.product_order_id}`
          : null;
      if (!objectKey) continue;
      const existing = feeMap.get(objectKey) ?? { platformFee: 0, refundNetSum: 0 };
      if (row.transaction_type === "platform_fee" || row.transaction_type === "service_fee") {
        existing.platformFee += Math.abs(Number(row.amount ?? 0));
      } else if (row.transaction_type === "refund") {
        if (isCashRefundComponent((row as { refund_component: string | null }).refund_component)) {
          existing.refundNetSum += Number(row.net ?? row.amount ?? 0);
        }
      }
      feeMap.set(objectKey, existing);
    }

    type PayoutRow = {
      bookingId: string | null;
      productOrderId?: string;
      bookedAmount: number;
      grossAmount: number;
      refundedAmount: number;
      bookedNetOfRefunds: number;
      netAmount: number;
      platformFee: number;
      payoutAmount: number;
      /** Latest ledger settlement instant for rows in this window (display / sort). */
      ledgerSettlementAt: string;
      /** Convenience label for UI */
      referenceLabel: string;
    };

    const payouts: PayoutRow[] = [];

    for (const [bookingId, payoutAmount] of revenueByBooking.entries()) {
      const fees = feeMap.get(`booking:${bookingId}`);
      const booking = bookingsById.get(bookingId);
      const bookedAmount = Number(booking?.total_amount ?? 0);
      const refundedAmount = Math.abs(fees?.refundNetSum ?? 0);
      const platformFee = fees?.platformFee ?? 0;
      const bookedNetOfRefunds = Math.max(0, bookedAmount - refundedAmount);
      const ledgerSettlementAt =
        latestSettlementAtByBooking.get(bookingId) ??
        booking?.scheduled_at ??
        new Date(fromDate).toISOString();

      payouts.push({
        bookingId,
        bookedAmount,
        grossAmount: bookedAmount,
        refundedAmount,
        bookedNetOfRefunds,
        netAmount: bookedNetOfRefunds,
        platformFee,
        payoutAmount,
        ledgerSettlementAt,
        referenceLabel: "Booking",
      });
    }

    for (const [productOrderId, payoutAmount] of revenueByProductOrder.entries()) {
      const fees = feeMap.get(`order:${productOrderId}`);
      const order = productOrders.find((o) => o.id === productOrderId);
      const bookedAmount = Number(order?.total_amount ?? 0);
      const refundedAmount = Math.abs(fees?.refundNetSum ?? 0);
      const platformFee = fees?.platformFee ?? 0;
      const bookedNetOfRefunds = Math.max(0, bookedAmount - refundedAmount);
      const ledgerSettlementAt =
        latestSettlementAtByProductOrder.get(productOrderId) ??
        order?.created_at ??
        new Date(fromDate).toISOString();

      payouts.push({
        bookingId: null,
        productOrderId,
        bookedAmount,
        grossAmount: bookedAmount,
        refundedAmount,
        bookedNetOfRefunds,
        netAmount: bookedNetOfRefunds,
        platformFee,
        payoutAmount,
        ledgerSettlementAt,
        referenceLabel: "Retail order",
      });
    }

    payouts.sort((a, b) => new Date(b.ledgerSettlementAt).getTime() - new Date(a.ledgerSettlementAt).getTime());

    const totalPayouts = payouts.length;
    const totalPayoutAmount = payouts.reduce((sum, p) => sum + p.payoutAmount, 0);
    const totalBookedAmount = payouts.reduce((sum, p) => sum + p.bookedAmount, 0);
    const totalBookedNetOfRefunds = payouts.reduce((sum, p) => sum + p.bookedNetOfRefunds, 0);
    const totalPlatformFees = payouts.reduce((sum, p) => sum + p.platformFee, 0);
    const totalRefunded = payouts.reduce((sum, p) => sum + p.refundedAmount, 0);
    const averagePayout = totalPayouts > 0 ? totalPayoutAmount / totalPayouts : 0;

    /** Ledger earnings totals by calendar month (provider timezone), from daily sums — matches headline totals. */
    const monthlyFromLedger = new Map<string, { amount: number }>();
    for (const [dayKey, amount] of revenueByDate.entries()) {
      const monthKey = dayKey.slice(0, 7);
      const cur = monthlyFromLedger.get(monthKey) ?? { amount: 0 };
      cur.amount += amount;
      monthlyFromLedger.set(monthKey, cur);
    }

    /** Row counts per month (booking or order appears once per latest settlement month). */
    const monthlyCounts = new Map<string, number>();
    for (const p of payouts) {
      const mk = reportDateKey(new Date(p.ledgerSettlementAt), reportContext.timezone).slice(0, 7);
      monthlyCounts.set(mk, (monthlyCounts.get(mk) ?? 0) + 1);
    }

    const monthlyBreakdown = [...new Set([...monthlyFromLedger.keys(), ...monthlyCounts.keys()])]
      .sort((a, b) => a.localeCompare(b))
      .map((month) => ({
        month,
        count: monthlyCounts.get(month) ?? 0,
        amount: monthlyFromLedger.get(month)?.amount ?? 0,
      }));

    const platformFeeRateBooked = totalBookedAmount > 0 ? (totalPlatformFees / totalBookedAmount) * 100 : 0;

    const reportBasis =
      `Ledger window ${fromYmd}–${toYmd} (${reportContext.timezone}): headline totals are net \`provider_earnings\` rows with settlement timestamps in range — not bank payout transfers. ` +
      `Booked amounts come from booking/order totals for rows linked on the ledger (appointment date may be outside this window). ` +
      `Platform/service fees and refunds shown are ledger rows in the same window, keyed to those bookings or orders when linked.`;

    return successResponse({
      timezone: reportContext.timezone,
      fromYmd,
      toYmd,
      reportBasis,
      basis: {
        headlineTotal:
          "Sum of net provider_earnings finance_transactions with created_at in the selected range (after location attribution when filtered).",
        bookedAmount:
          "booking.total_amount or product_orders.total_amount for IDs present on those ledger rows — not filtered by appointment date.",
        payoutAmountPerRow:
          "Net provider earnings attributed to that booking or retail order in the ledger window.",
        platformFeesAndRefunds:
          "platform_fee, service_fee, and refund ledger rows in the same window, matched by booking_id or product_order_id.",
        notIncluded:
          "Walk-in cash or terminal takings with no finance_transactions (see end-of-day / payment summary). This report is not bank payout history.",
      },
      totalPayouts,
      /** Net provider_earnings in range (excludes tips/travel — see basis.headlineTotal). */
      totalPayoutAmount,
      /** Alias clarifying headline semantics — same as totalPayoutAmount. */
      totalLedgerServiceEarnings: totalPayoutAmount,
      totalBookedAmount,
      totalBookedNetOfRefunds,
      totalPlatformFees,
      totalRefunded,
      averagePayout,
      platformFeeRate: platformFeeRateBooked,
      monthlyBreakdown,
      recentPayouts: payouts.slice(0, 20).map((p) => ({
        bookingId: p.bookingId,
        productOrderId: p.productOrderId,
        grossAmount: p.grossAmount,
        bookedAmount: p.bookedAmount,
        bookedNetOfRefunds: p.bookedNetOfRefunds,
        refundedAmount: p.refundedAmount,
        netAmount: p.netAmount,
        platformFee: p.platformFee,
        payoutAmount: p.payoutAmount,
        createdAt: p.ledgerSettlementAt,
        ledgerSettlementAt: p.ledgerSettlementAt,
        referenceLabel: p.referenceLabel,
      })),
      locationAttribution: feeLocationAttribution,
      totalGrossAmount: totalBookedAmount,
    });
  } catch (error) {
    return handleApiError(error, "Failed to generate payouts report");
  }
}
