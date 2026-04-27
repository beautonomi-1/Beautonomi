import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, getProviderIdForUser, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getAvailablePayoutBalance } from "@/lib/provider/available-payout-balance";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { fetchScopedSingle } from "@/lib/tenant/scoped-overrides";
import { MAX_FINANCE_TRANSACTIONS } from "@/lib/reports/constants";

/**
 * GET /api/provider/finance
 * 
 * Get provider's financial data (earnings, transactions, etc.)
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);

    const supabase = await getSupabaseServer(request);
    const { searchParams } = new URL(request.url);
    const locationId = searchParams.get("location_id");
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

    // Get date range
    const range = searchParams.get("range") || "month";
    const now = new Date();
    let startDate: Date;
    let lastMonthStart: Date;
    let lastMonthEnd: Date;

    if (range === "week") {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
      lastMonthStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 14);
      lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    } else if (range === "year") {
      startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      lastMonthStart = new Date(now.getFullYear() - 1, now.getMonth() - 1, 1);
      lastMonthEnd = new Date(now.getFullYear() - 1, now.getMonth(), 0);
    } else {
      // month (default)
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
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
      .select("id, transaction_type, amount, net, fees, commission, created_at, description, booking_id")
      .eq("provider_id", providerId)
      .gte("created_at", startIso)
      .lte("created_at", nowIso)
      .order("created_at", { ascending: false })
      .limit(MAX_FINANCE_TRANSACTIONS);

    const { data: ledgerRows, error: ledgerError } = await financeQuery;

    if (ledgerError) throw ledgerError;

    let rows = ledgerRows || [];
    
    // Fetch booking information for transactions that have booking_id
    // This is needed to check booking_source (walk-in vs online) and payment_provider for filtering
    const bookingIds = [...new Set(rows.filter((r: any) => r.booking_id).map((r: any) => r.booking_id))];
    let bookingMap: Record<string, { booking_source: string | null; location_id: string | null; payment_provider: string | null }> = {};
    
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
    
    // Enrich rows with booking information
    rows = rows.map((r: any) => ({
      ...r,
      booking_source: r.booking_id ? (bookingMap[r.booking_id]?.booking_source || null) : null,
      location_id: r.booking_id ? (bookingMap[r.booking_id]?.location_id || null) : null,
      payment_provider: r.booking_id ? (bookingMap[r.booking_id]?.payment_provider || null) : null,
    }));
    
    // Filter by location if location_id is provided
    if (locationId && rows.length > 0) {
      rows = rows.filter((r: any) => {
        // If transaction has booking_id, check if booking is in selected location
        if (r.booking_id && r.location_id) {
          return r.location_id === locationId;
        }
        // For transactions without booking_id (e.g., gift cards, memberships),
        // exclude them when filtering by location (they're provider-wide)
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
    const { availableBalance, pendingPayoutsSum } = await getAvailablePayoutBalance(db, providerId, {
      holdDays,
      tenantId: providerTenantId,
    });
    const pendingPayouts = pendingPayoutsSum;

    // Filter out internal transaction types that providers shouldn't see
    // "payment" type represents platform commission (internal accounting)
    // Only show transactions relevant to providers: provider_earnings, refunds, tips, travel_fees, etc.
    const visibleTransactionTypes = [
      "provider_earnings",
      "refund",
      "payout",
      "tip",
      "travel_fee",
      "platform_fee",
      "service_fee",
      "tax",
      "membership_sale",
      "gift_card_sale",
      "walk_in_additional_charge",
      "additional_charge",
      "additional_charge_payment",
      "cancellation_fee",
    ];
    
    const transactions = rows
      .filter((r: any) => visibleTransactionTypes.includes(r.transaction_type))
      .slice(0, 50)
      .map((r: any) => ({
        id: r.id,
        booking_id: r.booking_id || null,
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
        currency: lastResortCurrency,
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
        total_earnings: providerEarningsTotal,
        pending_payouts: pendingPayouts,
        available_balance: availableBalance,
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
        walk_in_additional_charges_total: walkInAdditionalChargesTotal,
        walk_in_additional_charges_this_period: walkInAdditionalChargesThisPeriod,
        tips_total: tipsTotal,
        tips_this_period: tipsThisPeriod,
        cancellation_fees_total: cancellationFeesTotal,
        cancellation_fees_this_period: cancellationFeesThisPeriod,
        additional_charges_total: additionalChargesTotal,
        additional_charges_this_period: additionalChargesThisPeriod,
      },
      transactions: transactions,
      language_context: {
        audience: "provider",
        metric_labels: {
          available_balance: "platform-held payoutable balance",
          total_earnings: "provider earnings",
          product_sales_earnings_total: "platform-held ecommerce provider earnings",
          walk_in_additional_charges_total: "cash register/end-of-day collection",
          gift_card_sales_this_period: "liability movement",
          membership_sales_this_period: "liability or deferred revenue movement",
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
