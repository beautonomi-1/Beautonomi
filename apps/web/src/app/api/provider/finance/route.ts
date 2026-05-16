import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getProviderIdForUser, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { requireAnyPermission } from "@/lib/auth/requirePermission";
import { getAvailablePayoutBalance } from "@/lib/provider/available-payout-balance";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { fetchScopedSingle } from "@/lib/tenant/scoped-overrides";
import { PROVIDER_LEDGER_VISIBLE_TYPES } from "@/lib/provider/provider-ledger-transaction-view";
import {
  getProviderPrimaryReportLocationId,
  getProviderReportContext,
  productOrderReportLocationId,
} from "@/lib/reports/provider-report-utils";
import { subDays, subMonths, subYears, startOfMonth, endOfMonth } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { dateRangeBoundsUtc, formatDateYmd } from "@/lib/dates/provider-tz";

const LEDGER_PAGE_SIZE = 1000;

async function fetchAllLedgerPages(query: any): Promise<any[]> {
  const rows: any[] = [];
  for (let from = 0; ; from += LEDGER_PAGE_SIZE) {
    const { data, error } = await query.range(from, from + LEDGER_PAGE_SIZE - 1);
    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < LEDGER_PAGE_SIZE) break;
  }
  return rows;
}

/**
 * GET /api/provider/finance
 *
 * Get provider's financial data (earnings, transactions, etc.)
 *
 * Query params:
 * - `location_id`: scope **aggregates** (earnings, breakdown cards) to that branch when set.
 * - `transaction_feed=all`: when used **with** `location_id`, the returned `transactions` list is still
 *   org-wide for the selected date range (payouts and non-booking rows remain visible). Aggregates stay
 *   branch-scoped. Omit or use any other value to keep the transaction list aligned with the location filter.
 */
export async function GET(request: NextRequest) {
  try {
    const permissionCheck = await requireAnyPermission(["view_sales", "view_reports", "process_payments"], request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;

    const supabase = await getSupabaseServer(request);
    const { searchParams } = new URL(request.url);
    const locationId = searchParams.get("location_id");
    const transactionFeed = searchParams.get("transaction_feed");
    const transactionListAllLocations = transactionFeed === "all";
    const providerId = await getProviderIdForUser(user.id, supabase);

    /** Ledger + booking_payment enrichment bypass RLS so rows with null booking_id (payouts, gift cards, etc.) still load. */
    const db = getSupabaseAdmin();
    
    if (!providerId) {
      const { data: platformRow } = await (supabase as any)
        .from("platform_settings")
        .select("settings")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      const minimumPayout = (platformRow?.settings as any)?.payouts?.minimum_payout_amount ?? 100;
      return successResponse({
        earnings: {
          total_earnings: 0,
          pending_payouts: 0,
          available_balance: 0,
          minimum_payout_amount: minimumPayout,
          this_month: 0,
          last_month: 0,
          growth_percentage: 0,
        },
        transactions: [],
      });
    }

    const { data: prow } = await supabase
      .from("providers")
      .select("tenant_id")
      .eq("id", providerId)
      .maybeSingle();
    const effectiveTenantId =
      (prow as { tenant_id?: string | null } | null)?.tenant_id ??
      (await resolveTenantIdWithZaFallback(request));
    const tenantRegion = await getTenantRegionConfig(effectiveTenantId);
    const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    // Get date range (provider timezone — aligns with reports and mobile finance)
    const range = searchParams.get("range") || "month";
    const now = new Date();
    const reportContext = await getProviderReportContext(db, providerId);
    const tz = reportContext.timezone;
    const zNow = toZonedTime(now, tz);
    const todayYmd = formatDateYmd(now, tz);

    let startDate: Date;
    let lastMonthStart: Date;
    let lastMonthEnd: Date;

    if (range === "all") {
      startDate = new Date("1970-01-01T00:00:00.000Z");
      const prevM = subMonths(zNow, 1);
      const lmStartYmd = formatDateYmd(startOfMonth(prevM), tz);
      const lmEndYmd = formatDateYmd(endOfMonth(prevM), tz);
      const lm = dateRangeBoundsUtc(lmStartYmd, lmEndYmd, tz);
      lastMonthStart = new Date(lm.fromIso);
      lastMonthEnd = new Date(lm.toIso);
    } else if (range === "week") {
      const curFromYmd = formatDateYmd(subDays(zNow, 7), tz);
      startDate = new Date(dateRangeBoundsUtc(curFromYmd, todayYmd, tz).fromIso);
      const prevStartYmd = formatDateYmd(subDays(zNow, 14), tz);
      const prevEndYmd = formatDateYmd(subDays(zNow, 8), tz);
      const prev = dateRangeBoundsUtc(prevStartYmd, prevEndYmd, tz);
      lastMonthStart = new Date(prev.fromIso);
      lastMonthEnd = new Date(prev.toIso);
    } else if (range === "year") {
      const yStartYmd = formatDateYmd(subYears(zNow, 1), tz);
      startDate = new Date(dateRangeBoundsUtc(yStartYmd, todayYmd, tz).fromIso);
      const prevPeriodAnchor = subMonths(subYears(zNow, 1), 1);
      const lmStartYmd = formatDateYmd(startOfMonth(prevPeriodAnchor), tz);
      const lmEndYmd = formatDateYmd(endOfMonth(prevPeriodAnchor), tz);
      const lm = dateRangeBoundsUtc(lmStartYmd, lmEndYmd, tz);
      lastMonthStart = new Date(lm.fromIso);
      lastMonthEnd = new Date(lm.toIso);
    } else {
      const monthStartYmd = formatDateYmd(startOfMonth(zNow), tz);
      startDate = new Date(dateRangeBoundsUtc(monthStartYmd, monthStartYmd, tz).fromIso);
      const prevM = subMonths(zNow, 1);
      const lmStartYmd = formatDateYmd(startOfMonth(prevM), tz);
      const lmEndYmd = formatDateYmd(endOfMonth(prevM), tz);
      const lm = dateRangeBoundsUtc(lmStartYmd, lmEndYmd, tz);
      lastMonthStart = new Date(lm.fromIso);
      lastMonthEnd = new Date(lm.toIso);
    }

    // Provider earnings are ledger-driven.
    // Provider streams:
    // - provider_earnings (bookings + additional charges)
    // - membership_sale (if provider offers memberships)
    // - gift_card_sale (if provider offers gift cards)
    // - refunds (negative; impacts provider net depending on policy, shown separately)
    const startIso = range === "all" ? "1970-01-01T00:00:00.000Z" : startDate.toISOString();
    const nowIso = now.toISOString();

    // Build finance transactions query (service role: full ledger for this provider).
    // IMPORTANT: aggregates below (earnings, fees, tips, refunds, growth, etc.) must scan
    // the complete ledger in the selected range. A page-level LIMIT here was previously
    // capping totals for any provider that had >200 rows — producing understated numbers
    // on the finance page, mobile transactions hub, and payouts screen. Keep the limit
    // only on the rendered transaction list (below).
    const financeQuery = db
      .from("finance_transactions")
      .select(
        "id, transaction_type, amount, net, fees, commission, created_at, description, booking_id, product_order_id, currency",
      )
      .eq("provider_id", providerId)
      .gte("created_at", startIso)
      .lte("created_at", nowIso)
      .order("created_at", { ascending: false });

    let rows = await fetchAllLedgerPages(financeQuery);
    
    // Fetch booking/order information for transactions that have source records.
    // This is needed to check booking_source/payment_provider and to apply location filters.
    const bookingIds = [...new Set(rows.filter((r: any) => r.booking_id).map((r: any) => r.booking_id))];
    let bookingMap: Record<string, { booking_source: string | null; location_id: string | null; payment_provider: string | null }> = {};
    const productOrderIds = [...new Set(rows.filter((r: any) => r.product_order_id).map((r: any) => r.product_order_id))];
    let productOrderMap: Record<string, { report_location_id: string | null; collection_location_id: string | null; fulfillment_type: string | null; order_source: string | null; payment_method: string | null }> = {};
    
    if (bookingIds.length > 0) {
      // Fetch bookings
      const { data: bookings } = await db
        .from("bookings")
        .select("id, booking_source, location_id")
        .in("id", bookingIds);
      
      // Fetch payment provider from booking_payments (to check if walk-in paid via Paystack)
      let bookingPaymentsQuery = db
        .from("booking_payments")
        .select("booking_id, payment_provider")
        .in("booking_id", bookingIds)
        .eq("status", "completed")
        .order("created_at", { ascending: false });
      const providerTenantForBp = (prow as { tenant_id?: string | null } | null)?.tenant_id;
      if (providerTenantForBp) {
        bookingPaymentsQuery = bookingPaymentsQuery.eq("tenant_id", providerTenantForBp);
      }
      const { data: bookingPayments } = await bookingPaymentsQuery;
      
      if (bookings) {
        bookingMap = bookings.reduce((acc: any, b: any) => {
          // Find the most recent payment for this booking
          const payment = bookingPayments?.find((p: any) => p.booking_id === b.id);
          acc[b.id] = {
            booking_source: b.booking_source || null,
            location_id: b.location_id || null,
            payment_provider: payment?.payment_provider || null,
          };
          return acc;
        }, {});
      }
    }

    if (productOrderIds.length > 0) {
      const { data: productOrders } = await db
        .from("product_orders")
        .select("id, collection_location_id, fulfillment_type, order_source, payment_method")
        .in("id", productOrderIds);
      const primaryLocationId = await getProviderPrimaryReportLocationId(db, providerId);

      if (productOrders) {
        productOrderMap = productOrders.reduce((acc: any, order: any) => {
          acc[order.id] = {
            report_location_id: productOrderReportLocationId(order, primaryLocationId),
            collection_location_id: order.collection_location_id || null,
            fulfillment_type: order.fulfillment_type || null,
            order_source: order.order_source || null,
            payment_method: order.payment_method || null,
          };
          return acc;
        }, {});
      }
    }
    
    // Enrich rows with booking information
    rows = rows.map((r: any) => ({
      ...r,
      booking_source: r.booking_id ? (bookingMap[r.booking_id]?.booking_source || null) : null,
      location_id: r.booking_id ? (bookingMap[r.booking_id]?.location_id || null) : null,
      payment_provider: r.booking_id ? (bookingMap[r.booking_id]?.payment_provider || null) : null,
      product_order_location_id: r.product_order_id
        ? (productOrderMap[r.product_order_id]?.report_location_id || null)
        : null,
      product_order_source: r.product_order_id
        ? (productOrderMap[r.product_order_id]?.order_source || null)
        : null,
      product_order_payment_method: r.product_order_id
        ? (productOrderMap[r.product_order_id]?.payment_method || null)
        : null,
    }));

    const enrichedBeforeLocationFilter = rows;

    // Filter by location if location_id is provided
    if (locationId && rows.length > 0) {
      rows = rows.filter((r: any) => {
        // If transaction has booking_id, check if booking is in selected location
        if (r.booking_id && r.location_id) {
          return r.location_id === locationId;
        }
        if (r.product_order_id) {
          return r.product_order_location_id === locationId;
        }
        // For transactions without booking_id/product_order_id (e.g., gift cards, memberships),
        // exclude them when filtering by location because they are provider-wide.
        return false;
      });
    }
    const sumNet = (types: string[], within?: { start: Date; end: Date }, excludeWalkIn: boolean = false) =>
      rows
        .filter((r: any) => types.includes(r.transaction_type))
        .filter((r: any) => {
          // Exclude walk-in bookings if requested (for available balance calculation)
          // BUT: Include walk-in bookings where payment was via Paystack (platform holds the money)
          // Only exclude walk-ins where payment was direct (cash, yoco, etc.)
          if (excludeWalkIn && r.booking_id && r.booking_source === 'walk_in') {
            // If payment_provider is 'paystack', include it (platform holds the money)
            // Otherwise exclude it (provider already received payment directly)
            if (r.payment_provider === 'paystack') {
              // Include - platform holds the money
              return true;
            }
            // Exclude - provider received payment directly (cash, yoco, etc.)
            return false;
          }
          if (!within) return true;
          const d = new Date(r.created_at);
          return d >= within.start && d <= within.end;
        })
        .reduce((s: number, r: any) => s + Number(r.net ?? r.amount ?? 0), 0);

    const sumAmount = (types: string[], within?: { start: Date; end: Date }) =>
      rows
        .filter((r: any) => types.includes(r.transaction_type))
        .filter((r: any) => {
          if (!within) return true;
          const d = new Date(r.created_at);
          return d >= within.start && d <= within.end;
        })
        .reduce((s: number, r: any) => s + Number(r.amount || 0), 0);

    const providerEarningsTotal = sumNet(["provider_earnings"]);
    const providerEarningsThis = sumNet(["provider_earnings"], { start: startDate, end: now });
    const providerEarningsLast = sumNet(["provider_earnings"], { start: lastMonthStart, end: lastMonthEnd });

    // Break down earnings by source: bookings (have booking_id) vs product orders (booking_id is null)
    const bookingEarningsTotal = rows
      .filter((r: any) => r.transaction_type === "provider_earnings" && r.booking_id)
      .reduce((s: number, r: any) => s + Number(r.net ?? r.amount ?? 0), 0);
    const bookingEarningsThisPeriod = rows
      .filter((r: any) => r.transaction_type === "provider_earnings" && r.booking_id)
      .filter((r: any) => { const d = new Date(r.created_at); return d >= startDate && d <= now; })
      .reduce((s: number, r: any) => s + Number(r.net ?? r.amount ?? 0), 0);
    const productSalesEarningsTotal = rows
      .filter((r: any) => r.transaction_type === "provider_earnings" && !r.booking_id)
      .reduce((s: number, r: any) => s + Number(r.net ?? r.amount ?? 0), 0);
    const productSalesEarningsThisPeriod = rows
      .filter((r: any) => r.transaction_type === "provider_earnings" && !r.booking_id)
      .filter((r: any) => { const d = new Date(r.created_at); return d >= startDate && d <= now; })
      .reduce((s: number, r: any) => s + Number(r.net ?? r.amount ?? 0), 0);
    /** Booking ledger uses `service_fee`; ecommerce uses `platform_fee` — both are platform-retained customer fees. */
    const sumPlatformRetainedFees = (within?: { start: Date; end: Date }) =>
      rows
        .filter((r: any) => r.transaction_type === "platform_fee" || r.transaction_type === "service_fee")
        .filter((r: any) => {
          if (!within) return true;
          const d = new Date(r.created_at);
          return d >= within.start && d <= within.end;
        })
        .reduce((s: number, r: any) => s + Math.abs(Number(r.net ?? r.amount ?? 0)), 0);
    const platformFeesDeducted = sumPlatformRetainedFees();
    const platformFeesDeductedThisPeriod = sumPlatformRetainedFees({ start: startDate, end: now });

    // Walk-in additional charges (audit/reporting only; not included in payout balance)
    const walkInAdditionalChargesTotal = sumNet(["walk_in_additional_charge"]);
    const walkInAdditionalChargesThisPeriod = sumNet(["walk_in_additional_charge"], { start: startDate, end: now });

    const tipsTotal = sumNet(["tip"]);
    const tipsThisPeriod = sumNet(["tip"], { start: startDate, end: now });
    const cancellationFeesTotal = sumNet(["cancellation_fee"]);
    const cancellationFeesThisPeriod = sumNet(["cancellation_fee"], { start: startDate, end: now });
    const additionalChargesTotal = sumNet(["additional_charge", "additional_charge_payment"]);
    const additionalChargesThisPeriod = sumNet(["additional_charge", "additional_charge_payment"], { start: startDate, end: now });

    const membershipSalesTotal = sumAmount(["membership_sale"], { start: startDate, end: now });
    const giftCardSalesTotal = sumAmount(["gift_card_sale"], { start: startDate, end: now });
    /** Travel fee rows store gross in `amount` with net=0 (travel is included in provider_earnings). */
    const sumTravelFeeAmount = (within?: { start: Date; end: Date }) =>
      rows
        .filter((r: any) => r.transaction_type === "travel_fee")
        .filter((r: any) => {
          if (!within) return true;
          const d = new Date(r.created_at);
          return d >= within.start && d <= within.end;
        })
        .reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
    const travelFeesTotal = sumTravelFeeAmount();
    const travelFeesThisPeriod = sumTravelFeeAmount({ start: startDate, end: now });
    const refundsTotal = rows.reduce((s: number, r: any) => {
      if (r.transaction_type === "refund") {
        return s + Math.abs(Number(r.net ?? r.amount ?? 0));
      }
      if (r.transaction_type === "provider_earnings" && Number(r.net ?? 0) < 0) {
        return s + Math.abs(Number(r.net ?? 0));
      }
      return s;
    }, 0);
    const refundsThisPeriod = rows
      .filter((r: any) => {
        const d = new Date(r.created_at);
        return d >= startDate && d <= now;
      })
      .reduce((s: number, r: any) => {
        if (r.transaction_type === "refund") {
          return s + Math.abs(Number(r.net ?? r.amount ?? 0));
        }
        if (r.transaction_type === "provider_earnings" && Number(r.net ?? 0) < 0) {
          return s + Math.abs(Number(r.net ?? 0));
        }
        return s;
      }, 0);

    const thisMonthTotal = providerEarningsThis;
    const lastMonthTotal = providerEarningsLast;

    const growthPercentage =
      lastMonthTotal !== 0 ? ((thisMonthTotal - lastMonthTotal) / Math.abs(lastMonthTotal)) * 100 : (thisMonthTotal > 0 ? 100 : 0);

    // Resolve payout settings tenant-scoped (aligned with payouts POST and dashboard).
    const providerTenantId = (prow as { tenant_id?: string | null } | null)?.tenant_id ?? null;
    const scopedPayoutSettings = await fetchScopedSingle<Record<string, unknown>>({
      supabase: supabase as any,
      table: "platform_settings",
      tenantId: providerTenantId ?? effectiveTenantId,
      select: "settings",
      apply: (q: any) => q.eq("is_active", true),
      orderBy: { column: "updated_at", ascending: false },
    });
    const payoutSettingsData = ((scopedPayoutSettings.data as { settings?: Record<string, unknown> } | null)?.settings as any)?.payouts ?? {};
    const holdDays = Number(payoutSettingsData.payout_hold_days ?? 0);
    const minimumPayoutAmount = Number(payoutSettingsData.minimum_payout_amount ?? 100);

    // Available balance and pending payouts: use ledger + payouts table (aligned with payouts API validation).
    const { availableBalance, pendingPayoutsSum, rawBalance, hasNegativeBalance } = await getAvailablePayoutBalance(
      db,
      providerId,
      {
        holdDays,
        tenantId: providerTenantId,
      },
    );

    const ledgerCurrencies = [
      ...new Set(rows.map((r: any) => (r.currency as string | null) || lastResortCurrency).filter(Boolean)),
    ] as string[];
    const ledger_currency_note =
      ledgerCurrencies.length > 1
        ? "Multiple currencies detected in finance_transactions; headline totals mix currencies until rows are fully stamped. Prefer per-currency reporting for reconciliation."
        : null;
    const pendingPayouts = pendingPayoutsSum;

    /** Booking-level discounts (already baked into totals the customer paid; informational). */
    const sumBookingDiscounts = async (fromIsoIn?: string, toIsoIn?: string) => {
      let membership = 0;
      let loyalty = 0;
      let promo = 0;
      for (let off = 0; ; off += 1000) {
        let bq = db
          .from("bookings")
          .select("membership_discount_amount, loyalty_discount_amount, promotion_discount_amount")
          .eq("provider_id", providerId);
        if (locationId) bq = bq.eq("location_id", locationId);
        if (fromIsoIn && toIsoIn) {
          bq = bq.gte("created_at", fromIsoIn).lte("created_at", toIsoIn);
        }
        const { data: dchunk, error: derr } = await bq.range(off, off + 999);
        if (derr) {
          console.warn("[finance] booking discount aggregate:", derr);
          break;
        }
        const chunk = dchunk ?? [];
        for (const r of chunk as any[]) {
          membership += Number(r.membership_discount_amount ?? 0);
          loyalty += Number(r.loyalty_discount_amount ?? 0);
          promo += Number(r.promotion_discount_amount ?? 0);
        }
        if (chunk.length < 1000) break;
      }
      return { membership_discounts_applied: membership, loyalty_discounts_applied: loyalty, promo_discounts_applied: promo };
    };

    const discountsThisPeriod = await sumBookingDiscounts(startIso, nowIso);
    const discountsAllTime = await sumBookingDiscounts();

    const rowsForTransactionList =
      locationId && transactionListAllLocations ? enrichedBeforeLocationFilter : rows;

    const transactions = rowsForTransactionList
      .filter((r: any) => PROVIDER_LEDGER_VISIBLE_TYPES.has(r.transaction_type))
      .slice(0, 50)
      .map((r: any) => ({
        id: r.id,
        booking_id: r.booking_id || null,
        product_order_id: r.product_order_id || null,
        transaction_type: r.transaction_type,
        type:
          r.transaction_type === "refund"
            ? ("refund" as const)
            : r.transaction_type === "payout"
            ? ("payout" as const)
            : r.transaction_type === "service_fee" || r.transaction_type === "platform_fee"
            ? ("platform_fee" as const)
            : ("booking" as const),
        date: r.created_at,
        amount: Number(r.amount || 0),
        net: Number(r.net ?? r.amount ?? 0),
        fees: Number(r.fees || 0),
        commission: Number(r.commission || 0),
        currency: (r.currency as string | null) || lastResortCurrency,
        status: "completed" as const,
        description:
          r.transaction_type === "service_fee"
            ? (typeof r.description === "string"
                ? r.description.replace(/^Service fee/i, "Platform fee")
                : "Platform fee")
            : r.description || r.transaction_type,
      }));

    return successResponse({
      earnings: {
        /**
         * Sum of `provider_earnings` net only. **Not additive** with `gift_card_sales_this_period` /
         * `membership_sales_this_period` (those are separate liability / deferred-revenue flows — F19).
         */
        total_earnings: providerEarningsTotal,
        pending_payouts: pendingPayouts,
        available_balance: availableBalance,
        raw_payout_balance: rawBalance,
        has_negative_payout_balance: hasNegativeBalance,
        balance_owed_to_platform: hasNegativeBalance ? Math.abs(rawBalance) : 0,
        ledger_currencies: ledgerCurrencies,
        ledger_currency_note,
        payout_hold_days: holdDays,
        minimum_payout_amount: minimumPayoutAmount,
        this_month: thisMonthTotal,
        last_month: lastMonthTotal,
        growth_percentage: Math.round(growthPercentage * 10) / 10,
        bookings_earnings_total: bookingEarningsTotal,
        bookings_earnings_this_period: bookingEarningsThisPeriod,
        product_sales_earnings_total: productSalesEarningsTotal,
        product_sales_earnings_this_period: productSalesEarningsThisPeriod,
        platform_fees_deducted: platformFeesDeducted,
        platform_fees_deducted_this_period: platformFeesDeductedThisPeriod,
        gift_card_sales_this_period: giftCardSalesTotal,
        membership_sales_this_period: membershipSalesTotal,
        travel_fees_total: travelFeesTotal,
        travel_fees_this_period: travelFeesThisPeriod,
        refunds_total: refundsTotal,
        refunds_this_period: refundsThisPeriod,
        walk_in_additional_charges_total: walkInAdditionalChargesTotal,
        walk_in_additional_charges_this_period: walkInAdditionalChargesThisPeriod,
        tips_total: tipsTotal,
        tips_this_period: tipsThisPeriod,
        cancellation_fees_total: cancellationFeesTotal,
        cancellation_fees_this_period: cancellationFeesThisPeriod,
        additional_charges_total: additionalChargesTotal,
        additional_charges_this_period: additionalChargesThisPeriod,
        membership_discounts_this_period: discountsThisPeriod.membership_discounts_applied,
        loyalty_discounts_this_period: discountsThisPeriod.loyalty_discounts_applied,
        promo_discounts_this_period: discountsThisPeriod.promo_discounts_applied,
        membership_discounts_total: discountsAllTime.membership_discounts_applied,
        loyalty_discounts_total: discountsAllTime.loyalty_discounts_applied,
        promo_discounts_total: discountsAllTime.promo_discounts_applied,
      },
      transactions: transactions,
      language_context: {
        audience: "provider",
        metric_labels: {
          available_balance: "platform-held payoutable balance",
          total_earnings: "provider earnings",
          product_sales_earnings_total: "platform-held ecommerce provider earnings",
          walk_in_additional_charges_total: "cash register/end-of-day collection",
          gift_card_sales_this_period:
            "liability movement — do not add to total_earnings (gift card cash is not provider service income)",
          membership_sales_this_period:
            "liability or deferred revenue movement — do not add to total_earnings (not the same as booked service earnings)",
          platform_fees_deducted: "platform revenue and fees",
        },
        glossary: {
          available_balance: "Amount currently available for payout after hold period and prior payouts.",
          pending_payouts: "Payout requests created but not yet completed.",
          refunds_total: "Total refund-related deductions affecting your earnings in the selected range.",
          platform_fees_deducted:
            "Customer-paid platform fees retained by Beautonomi (includes booking platform fee and ecommerce platform fee lines in the ledger).",
        },
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch finance data");
  }
}
