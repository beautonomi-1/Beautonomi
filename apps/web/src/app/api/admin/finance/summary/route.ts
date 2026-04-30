import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection } from "@/lib/supabase/api-helpers";
import { unauthorizedResponse } from "@/lib/auth/requireRole";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { fetchFinanceLedgerRowsForTenant, normalizeAdminLedgerRange } from "@/lib/admin/finance-ledger-tenant";
import { aggregateFinanceLedgerRows } from "@/lib/admin/aggregate-finance-ledger-rows";
import {
  FINANCE_METRIC_CONTRACT_VERSION,
  getFinanceMetricContracts,
} from "@/lib/admin/finance-metric-contracts";
import {
  getNegativeBalanceProvidersForTenant,
  type NegativeBalanceProvidersPayload,
} from "@/lib/admin/negative-provider-payout-balances";

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
    const normalizedRange = normalizeAdminLedgerRange({ start: startDate, end: endDate });
    const providerIdFilter = searchParams.get("provider_id");

    const supabaseAdmin = getSupabaseAdmin();

    const [tx, negativeBalanceProviders] = await Promise.all([
      fetchFinanceLedgerRowsForTenant(supabase, tenantId, {
        start: startDate,
        end: endDate,
      }, providerIdFilter ? { restrictProviderIds: [providerIdFilter] } : undefined),
      getNegativeBalanceProvidersForTenant(supabaseAdmin, tenantId).catch((e) => {
        console.warn("Negative payout balance scan failed:", e);
        return { count: 0, providers: [] } satisfies NegativeBalanceProvidersPayload;
      }),
    ]);

    const agg = aggregateFinanceLedgerRows(tx);
    let walletTopupCashCollected = 0;
    let referralPayouts = 0;
    let outstandingGiftCardLiability = 0;
    let bookingsGmv = 0;
    try {
      let topupQuery = supabaseAdmin
        .from("wallet_topups")
        .select("amount")
        .eq("status", "paid")
        .eq("tenant_id", tenantId);
      if (normalizedRange.start) topupQuery = topupQuery.gte("paid_at", normalizedRange.start);
      if (normalizedRange.end) topupQuery = topupQuery.lte("paid_at", normalizedRange.end);
      const { data: topups, error: topErr } = await topupQuery;
      if (topErr) {
        console.warn("Wallet topups tenant-scoped query failed:", topErr.message);
      } else {
        walletTopupCashCollected = (topups || []).reduce((s, r) => s + Number(r.amount || 0), 0);
      }

      let refQuery = supabaseAdmin
        .from("wallet_transactions")
        .select("amount")
        .eq("type", "credit")
        .eq("reference_type", "referral")
        .eq("tenant_id", tenantId);
      if (normalizedRange.start) refQuery = refQuery.gte("created_at", normalizedRange.start);
      if (normalizedRange.end) refQuery = refQuery.lte("created_at", normalizedRange.end);
      const { data: refTxs, error: refErr } = await refQuery;
      if (refErr) {
        console.warn("Referral wallet credits tenant-scoped query failed:", refErr.message);
      } else {
        referralPayouts = (refTxs || []).reduce((s, r) => s + Number(r.amount || 0), 0);
      }

      const { data: giftCards, error: giftErr } = await supabaseAdmin
        .from("gift_cards")
        .select("balance")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .gt("balance", 0);
      if (giftErr) {
        console.warn("Gift card liability query failed:", giftErr.message);
      } else {
        outstandingGiftCardLiability = (giftCards || []).reduce(
          (s, row) => s + Number(row.balance || 0),
          0
        );
      }

      let bookingsQuery = supabaseAdmin
        .from("bookings")
        .select("total_amount")
        .eq("tenant_id", tenantId)
        .in("status", ["confirmed", "completed"]);
      if (normalizedRange.start) bookingsQuery = bookingsQuery.gte("scheduled_at", normalizedRange.start);
      if (normalizedRange.end) bookingsQuery = bookingsQuery.lte("scheduled_at", normalizedRange.end);
      const { data: bookingRows, error: bookingErr } = await bookingsQuery;
      if (bookingErr) {
        console.warn("Bookings GMV reconciliation query failed:", bookingErr.message);
      } else {
        bookingsGmv = (bookingRows || []).reduce((s, row) => s + Number(row.total_amount || 0), 0);
      }
    } catch (e) {
      console.warn("Wallet/referral counts failed:", e);
    }

    // Cancellation fees from ledger (single source of truth, not from bookings table)
    const cancellationFeesRetained = agg.cancellation_fees_retained;

    const customerPaidPlatformFees = agg.service_fee_revenue;
    const totalPlatformRecognizedRevenue =
      agg.platform_take_net + agg.subscription_net + agg.ads_net + customerPaidPlatformFees;
    const totalPlatformRecognizedRevenueAfterReferrals =
      totalPlatformRecognizedRevenue - referralPayouts;
    const providerRefundImpact = Math.abs(agg.provider_refund_net_impact);
    const providerNetAfterRefunds =
      agg.provider_earnings_net + cancellationFeesRetained + agg.tips_gross - providerRefundImpact;
    const gmvVariance = agg.service_collected_gross - bookingsGmv;
    const gmvVariancePct = bookingsGmv > 0 ? (gmvVariance / bookingsGmv) * 100 : 0;
    const outOfBalance = Math.abs(gmvVariance) > 1;
    const highNegativeRefundPressure = providerRefundImpact > Math.max(agg.provider_earnings_net, 0);

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
        settled_service_gmv: agg.service_collected_gross,
        settledLedgerAmount: agg.service_collected_gross,
        gross_booked_value: bookingsGmv,
        grossBookedValue: bookingsGmv,
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
        total_platform_take_net_including_customer_fees: totalPlatformRecognizedRevenue,

        provider_earnings: agg.provider_earnings_net,
        providerEarnings: agg.provider_earnings_net,
        provider_net_activity: providerNetAfterRefunds,
        providerNetActivity: providerNetAfterRefunds,
        cancellation_fees_retained: cancellationFeesRetained,
        refunds_gross: agg.refunds_gross,
        refunds_abs_gross: agg.refunds_abs_gross,
        provider_refund_net_impact: agg.provider_refund_net_impact,
        gift_card_sales: agg.gift_card_sales,
        membership_sales: agg.membership_sales,

        service_fee_revenue: customerPaidPlatformFees,
        platform_fee_revenue: customerPaidPlatformFees,
        customer_paid_platform_fees: customerPaidPlatformFees,
        ecommerce_platform_fees: agg.ecommerce_platform_fees,
        additional_charge_gross: agg.additional_charge_gross,
        travel_fees: agg.travel_fees,
        manual_adjustments_net: agg.manual_adjustments_net,

        wallet_topup_revenue: walletTopupCashCollected,
        wallet_topup_cash_collected: walletTopupCashCollected,
        referral_payouts: referralPayouts,
        total_platform_take_after_referrals: totalPlatformRecognizedRevenueAfterReferrals,

        platform_revenue: {
          booking_commission: agg.platform_take_net,
          customer_paid_platform_fees: customerPaidPlatformFees,
          subscriptions: agg.subscription_net,
          ads: agg.ads_net,
          service_fees: customerPaidPlatformFees,
          ecommerce_fees_detail: agg.ecommerce_platform_fees,
          wallet_topups: walletTopupCashCollected,
          manual_adjustments: agg.manual_adjustments_net,
          total: totalPlatformRecognizedRevenue,
          total_after_referrals: totalPlatformRecognizedRevenueAfterReferrals,
        },

        provider_revenue: {
          provider_earnings: agg.provider_earnings_net,
          cancellation_fees: cancellationFeesRetained,
          tips: agg.tips_gross,
          taxes_collected: agg.taxes_gross,
          refunds: agg.refunds_gross,
          refund_impact_net: agg.provider_refund_net_impact,
          net_after_refunds: providerNetAfterRefunds,
        },

        revenue_streams: {
          booking_commission: agg.platform_take_net,
          customer_paid_platform_fees: customerPaidPlatformFees,
          subscriptions: agg.subscription_net,
          ads: agg.ads_net,
          service_fees: customerPaidPlatformFees,
          ecommerce_fees_detail: agg.ecommerce_platform_fees,
          wallet_topups: walletTopupCashCollected,
          manual_adjustments: agg.manual_adjustments_net,
          total: totalPlatformRecognizedRevenue,
        },

        liabilities: {
          wallet_topups_cash_collected: walletTopupCashCollected,
          gift_card_outstanding: outstandingGiftCardLiability,
        },
        pass_through: {
          taxes_collected: agg.taxes_gross,
          tips_collected: agg.tips_gross,
        },
        reconciliation: {
          generated_at: new Date().toISOString(),
          checks: {
            ledger_vs_bookings_gmv: {
              ledger_gmv: agg.service_collected_gross,
              bookings_gmv: bookingsGmv,
              variance: gmvVariance,
              variance_pct: gmvVariancePct,
              status: outOfBalance ? "warning" : "ok",
            },
            negative_provider_payout_balances: {
              count: negativeBalanceProviders.count ?? 0,
              status: (negativeBalanceProviders.count ?? 0) > 0 ? "warning" : "ok",
            },
            refund_burden_pressure: {
              provider_refund_impact: providerRefundImpact,
              provider_earnings: agg.provider_earnings_net,
              status: highNegativeRefundPressure ? "warning" : "ok",
            },
            platform_net_health: {
              platform_net: agg.platform_take_net + agg.subscription_net + agg.ads_net + customerPaidPlatformFees,
              manual_adjustments_net: agg.manual_adjustments_net,
              status:
                totalPlatformRecognizedRevenue < 0
                  ? "warning"
                  : "ok",
            },
          },
        metrics_meta: {
          contract_version: FINANCE_METRIC_CONTRACT_VERSION,
          generated_at: new Date().toISOString(),
          contracts: getFinanceMetricContracts([
            "platformRecognizedRevenue",
            "providerNetEarnings",
            "taxesCollected",
            "liabilityWalletTopups",
            "liabilityGiftCardOutstanding",
          ]),
        },
        language_context: {
          audience: "platform_admin",
          glossary: {
            platform_net_earnings: "Recognized platform revenue after platform-specific deductions.",
            provider_net_earnings: "Provider-attributable earnings net of provider-attributable deductions.",
            taxes_collected: "Pass-through tax collected on behalf of tax authority, not platform revenue.",
            wallet_topups_cash_collected: "Custodial cash inflow recorded as liability until redeemed.",
          },
        },
        },

        gmv_growth: gmvGrowth,
        period: {
          start_date: startDate || null,
          end_date: endDate || null,
        },

        negative_balance_providers: negativeBalanceProviders,
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
