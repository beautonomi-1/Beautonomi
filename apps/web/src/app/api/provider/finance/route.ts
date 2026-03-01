import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getAvailablePayoutBalance } from "@/lib/provider/available-payout-balance";

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

    // Build finance transactions query
    const financeQuery = supabase
      .from("finance_transactions")
      .select("id, transaction_type, amount, net, created_at, description, booking_id")
      .eq("provider_id", providerId)
      .gte("created_at", startIso)
      .lte("created_at", nowIso)
      .order("created_at", { ascending: false })
      .limit(200);

    const { data: ledgerRows, error: ledgerError } = await financeQuery;

    if (ledgerError) throw ledgerError;

    let rows = ledgerRows || [];
    
    // Fetch booking information for transactions that have booking_id
    // This is needed to check booking_source (walk-in vs online) and payment_provider for filtering
    const bookingIds = [...new Set(rows.filter((r: any) => r.booking_id).map((r: any) => r.booking_id))];
    let bookingMap: Record<string, { booking_source: string | null; location_id: string | null; payment_provider: string | null }> = {};
    
    if (bookingIds.length > 0) {
      // Fetch bookings
      const { data: bookings } = await supabase
        .from("bookings")
        .select("id, booking_source, location_id")
        .in("id", bookingIds);
      
      // Fetch payment provider from booking_payments (to check if walk-in paid via Paystack)
      const { data: bookingPayments } = await supabase
        .from("booking_payments")
        .select("booking_id, payment_provider")
        .in("booking_id", bookingIds)
        .eq("status", "completed")
        .order("created_at", { ascending: false });
      
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

    const membershipSalesTotal = sumAmount(["membership_sale"], { start: startDate, end: now });
    const giftCardSalesTotal = sumAmount(["gift_card_sale"], { start: startDate, end: now });
    const travelFeesTotal = sumNet(["travel_fee"]);
    const travelFeesThisPeriod = sumNet(["travel_fee"], { start: startDate, end: now });
    const refundsTotal = rows
      .filter((r: any) => r.transaction_type === "provider_earnings")
      .reduce((s: number, r: any) => s + (Number(r.net || 0) < 0 ? Number(r.net || 0) : 0), 0);

    const thisMonthTotal = providerEarningsThis;
    const lastMonthTotal = providerEarningsLast;

    const growthPercentage =
      lastMonthTotal !== 0 ? ((thisMonthTotal - lastMonthTotal) / Math.abs(lastMonthTotal)) * 100 : (thisMonthTotal > 0 ? 100 : 0);

    // Available balance and pending payouts: use ledger + payouts table (aligned with payouts API validation).
    const { availableBalance, pendingPayoutsSum } = await getAvailablePayoutBalance(supabase, providerId);
    const pendingPayouts = pendingPayoutsSum;

    // Filter out internal transaction types that providers shouldn't see
    // "payment" type represents platform commission (internal accounting)
    // Only show transactions relevant to providers: provider_earnings, refunds, tips, travel_fees, etc.
    const visibleTransactionTypes = [
      "provider_earnings",
      "refund",
      "tip",
      "travel_fee",
      "service_fee",
      "tax",
      "membership_sale",
      "gift_card_sale",
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
            : r.transaction_type === "provider_earnings"
            ? ("booking" as const)
            : ("booking" as const),
        date: r.created_at,
        amount: Number(r.amount || 0),
        net: Number(r.net ?? r.amount ?? 0),
        fees: Number(r.fees || 0),
        commission: Number(r.commission || 0),
        currency: "ZAR",
        status: "completed" as const,
        description: r.description || r.transaction_type,
      }));

    const { data: platformRow } = await (supabase as any)
      .from("platform_settings")
      .select("settings")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    const minimumPayoutAmount = (platformRow?.settings as any)?.payouts?.minimum_payout_amount ?? 100;

    return successResponse({
      earnings: {
        total_earnings: providerEarningsTotal,
        pending_payouts: pendingPayouts,
        available_balance: availableBalance,
        minimum_payout_amount: minimumPayoutAmount,
        this_month: thisMonthTotal,
        last_month: lastMonthTotal,
        growth_percentage: Math.round(growthPercentage * 10) / 10,
        bookings_earnings_total: providerEarningsTotal,
        gift_card_sales_this_period: giftCardSalesTotal,
        membership_sales_this_period: membershipSalesTotal,
        travel_fees_total: travelFeesTotal,
        travel_fees_this_period: travelFeesThisPeriod,
        refunds_total: refundsTotal,
      },
      transactions: transactions,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch finance data");
  }
}
