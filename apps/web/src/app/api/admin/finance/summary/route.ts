import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection } from "@/lib/supabase/api-helpers";
import { unauthorizedResponse } from "@/lib/auth/requireRole";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { fetchFinanceLedgerRowsForTenant } from "@/lib/admin/finance-ledger-tenant";
import { aggregateFinanceLedgerRows } from "@/lib/admin/aggregate-finance-ledger-rows";

/**
 * GET /api/admin/finance/summary
 *
 * Get financial summary (GMV, fees, net, provider earnings).
 * Ledger math is shared with the admin dashboard via `aggregateFinanceLedgerRows`.
 */
export async function GET(request: Request) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    if (!user) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveAdminApiTenantId(request);
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");

    const tx = await fetchFinanceLedgerRowsForTenant(supabase, tenantId, {
      start: startDate,
      end: endDate,
    });

    const agg = aggregateFinanceLedgerRows(tx);

    const supabaseAdmin = getSupabaseAdmin();
    let walletTopupRevenue = 0;
    let referralPayouts = 0;
    try {
      let topupQuery = supabaseAdmin
        .from("wallet_topups")
        .select("amount")
        .eq("status", "paid")
        .eq("tenant_id", tenantId);
      if (startDate) topupQuery = topupQuery.gte("paid_at", startDate);
      if (endDate) topupQuery = topupQuery.lte("paid_at", endDate);
      const { data: topups, error: topErr } = await topupQuery;
      if (topErr) {
        console.warn("Wallet topups tenant-scoped query failed:", topErr.message);
      } else {
        walletTopupRevenue = (topups || []).reduce((s, r) => s + Number(r.amount || 0), 0);
      }

      let refQuery = supabaseAdmin
        .from("wallet_transactions")
        .select("amount")
        .eq("type", "credit")
        .eq("reference_type", "referral")
        .eq("tenant_id", tenantId);
      if (startDate) refQuery = refQuery.gte("created_at", startDate);
      if (endDate) refQuery = refQuery.lte("created_at", endDate);
      const { data: refTxs, error: refErr } = await refQuery;
      if (refErr) {
        console.warn("Referral wallet credits tenant-scoped query failed:", refErr.message);
      } else {
        referralPayouts = (refTxs || []).reduce((s, r) => s + Number(r.amount || 0), 0);
      }
    } catch (e) {
      console.warn("Wallet/referral counts failed:", e);
    }

    // Cancellation fees from ledger (single source of truth, not from bookings table)
    const cancellationFeesRetained = agg.cancellation_fees_retained;

    const totalPlatformTakeAfterReferrals =
      agg.platform_take_net + agg.subscription_net + agg.ads_net + walletTopupRevenue - referralPayouts;

    const period = startDate && endDate ? "custom" : "month";
    let previousStart: string;
    let previousEnd: string;

    if (period === "month") {
      const now = new Date();
      const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

      previousStart = previousMonthStart.toISOString();
      previousEnd = previousMonthEnd.toISOString();
    } else {
      if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const diff = end.getTime() - start.getTime();
        const prevEnd = new Date(start.getTime() - 1);
        const prevStart = new Date(prevEnd.getTime() - diff);

        previousStart = prevStart.toISOString();
        previousEnd = prevEnd.toISOString();
      } else {
        previousStart = "";
        previousEnd = "";
      }
    }

    let previousGmv = 0;
    if (previousStart && previousEnd) {
      const prev = await fetchFinanceLedgerRowsForTenant(supabase, tenantId, {
        start: previousStart,
        end: previousEnd,
      });
      previousGmv = aggregateFinanceLedgerRows(prev).service_collected_gross;
    }

    const gmvGrowth =
      previousGmv > 0 ? ((agg.service_collected_gross - previousGmv) / previousGmv) * 100 : 0;

    return NextResponse.json({
      data: {
        service_collected_gross: agg.service_collected_gross,
        service_collected_net: agg.service_collected_net,
        gateway_fees: agg.gateway_fees_services,

        platform_commission_gross: agg.platform_commission_gross,
        platform_refund_impact: agg.platform_refund_impact,
        platform_commission_net: agg.platform_commission_net,
        platform_take_net: agg.platform_take_net,

        tips_gross: agg.tips_gross,
        taxes_gross: agg.taxes_gross,

        subscription_collected_gross: agg.subscription_gross,
        subscription_net: agg.subscription_net,
        subscription_gateway_fees: agg.subscription_gateway_fees,
        ads_net: agg.ads_net,
        ads_gross: agg.ads_gross,
        ads_gateway_fees: agg.ads_gateway_fees,
        total_platform_take_net: agg.platform_take_net + agg.subscription_net + agg.ads_net,

        provider_earnings: agg.provider_earnings_net,
        cancellation_fees_retained: cancellationFeesRetained,
        refunds_gross: agg.refunds_gross,
        gift_card_sales: agg.gift_card_sales,
        membership_sales: agg.membership_sales,

        service_fee_revenue: agg.service_fee_revenue,
        ecommerce_platform_fees: agg.ecommerce_platform_fees,
        additional_charge_gross: agg.additional_charge_gross,
        travel_fees: agg.travel_fees,

        wallet_topup_revenue: walletTopupRevenue,
        referral_payouts: referralPayouts,
        total_platform_take_after_referrals: totalPlatformTakeAfterReferrals,

        platform_revenue: {
          booking_commission: agg.platform_take_net,
          subscriptions: agg.subscription_net,
          ads: agg.ads_net,
          service_fees: agg.service_fee_revenue,
          ecommerce_fees: agg.ecommerce_platform_fees,
          wallet_topups: walletTopupRevenue,
          cancellation_fees: cancellationFeesRetained,
          total: agg.platform_take_net + agg.subscription_net + agg.ads_net + walletTopupRevenue + cancellationFeesRetained + agg.service_fee_revenue + agg.ecommerce_platform_fees,
        },

        provider_revenue: {
          provider_earnings: agg.provider_earnings_net,
          tips: agg.tips_gross,
          taxes_collected: agg.taxes_gross,
          refunds: agg.refunds_gross,
          net_after_refunds: agg.provider_earnings_net - Math.abs(agg.refunds_gross),
        },

        revenue_streams: {
          booking_commission: agg.platform_take_net,
          subscriptions: agg.subscription_net,
          ads: agg.ads_net,
          service_fees: agg.service_fee_revenue,
          ecommerce_fees: agg.ecommerce_platform_fees,
          wallet_topups: walletTopupRevenue,
          cancellation_fees: cancellationFeesRetained,
          total: agg.platform_take_net + agg.subscription_net + agg.ads_net + walletTopupRevenue + cancellationFeesRetained + agg.service_fee_revenue + agg.ecommerce_platform_fees,
        },

        gmv_growth: gmvGrowth,
        period: {
          start_date: startDate || null,
          end_date: endDate || null,
        },
      },
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/finance/summary:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to fetch finance summary",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
