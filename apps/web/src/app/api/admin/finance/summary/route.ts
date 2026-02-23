import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";

/**
 * GET /api/admin/finance/summary
 * 
 * Get financial summary (GMV, fees, net, provider earnings)
 */
export async function GET(request: Request) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer(request);
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");

    // Finance ledger is the source of truth
    let ftQuery = supabase
      .from("finance_transactions")
      .select("transaction_type, amount, fees, commission, net, created_at", { count: "exact" });

    if (startDate) ftQuery = ftQuery.gte("created_at", startDate);
    if (endDate) ftQuery = ftQuery.lte("created_at", endDate);

    const { data: rows } = await ftQuery;
    const tx = rows || [];

    const sum = (
      types: string[],
      field: "amount" | "fees" | "commission" | "net" = "amount"
    ) =>
      tx
        .filter((r: any) => types.includes(r.transaction_type))
        .reduce((s: number, r: any) => s + Number(r[field] || 0), 0);

    // Gateway fees (only on payment and additional_charge_payment)
    const gatewayFeesServices = sum(["payment", "additional_charge_payment"], "fees");

    // Services collected (GMV): full customer payment for bookings + additional charges.
    // - payment row: amount = commission base (not full booking); full booking = commission base + provider_earnings + tip + tax + travel_fee + service_fee.
    // - additional_charge_payment: amount = net after gateway, so gross = amount + fees.
    const bookingGmv =
      sum(["payment"], "amount") +
      sum(["provider_earnings"], "amount") +
      sum(["tip"], "amount") +
      sum(["tax"], "amount") +
      sum(["travel_fee"], "amount") +
      sum(["service_fee"], "amount");
    const additionalChargeGross =
      sum(["additional_charge_payment"], "amount") + sum(["additional_charge_payment"], "fees");
    const serviceCollectedGross = bookingGmv + additionalChargeGross;
    const serviceCollectedNet = serviceCollectedGross - gatewayFeesServices;

    // Platform commission (gross and net of refunds)
    const platformCommissionGross = sum(["payment", "additional_charge_payment"], "net");
    const platformRefundImpact = sum(["refund"], "net"); // negative (commission reversal)
    const platformCommissionNet = platformCommissionGross + platformRefundImpact;

    // Platform take-home (commission net of refunds, minus gateway fees)
    const platformTakeNet = platformCommissionNet - gatewayFeesServices;

    // Tips & taxes (gross reporting; excluded from platform take)
    const tipsGross = sum(["tip"], "amount");
    const taxesGross = sum(["tax"], "amount");

    // Provider subscription revenue (platform earns this directly)
    const subscriptionNet = sum(["provider_subscription_payment"], "net");
    const subscriptionGatewayFees = sum(["provider_subscription_payment"], "fees");
    const subscriptionGross = subscriptionNet + subscriptionGatewayFees;

    // Ads revenue (provider pre-pay for campaign budget; platform earns when they pay)
    const adsNet = sum(["provider_ads_payment"], "net");
    const adsGatewayFees = sum(["provider_ads_payment"], "fees");
    const adsGross = adsNet + adsGatewayFees;

    const providerEarnings = sum(["provider_earnings"], "net");

    // Other provider-linked sales (gross)
    const giftCardSales = sum(["gift_card_sale"], "amount");
    const membershipSales = sum(["membership_sale"], "amount");

    // Refund gross: total amount refunded to customers (positive number for display)
    const refundsGross = sum(["refund"], "amount");

    // Wallet top-up revenue (cash in from customers; not in finance_transactions)
    const supabaseAdmin = getSupabaseAdmin();
    let walletTopupRevenue = 0;
    let referralPayouts = 0;
    try {
      let topupQuery = supabaseAdmin
        .from("wallet_topups")
        .select("amount")
        .eq("status", "paid");
      if (startDate) topupQuery = topupQuery.gte("paid_at", startDate);
      if (endDate) topupQuery = topupQuery.lte("paid_at", endDate);
      const { data: topups } = await topupQuery;
      walletTopupRevenue = (topups || []).reduce((s, r) => s + Number(r.amount || 0), 0);

      // Referral payouts (platform expense: credits to referrers' wallets)
      let refQuery = supabaseAdmin
        .from("wallet_transactions")
        .select("amount")
        .eq("type", "credit")
        .eq("reference_type", "referral");
      if (startDate) refQuery = refQuery.gte("created_at", startDate);
      if (endDate) refQuery = refQuery.lte("created_at", endDate);
      const { data: refTxs } = await refQuery;
      referralPayouts = (refTxs || []).reduce((s, r) => s + Number(r.amount || 0), 0);
    } catch (e) {
      console.warn("Wallet/referral counts failed:", e);
    }

    // Total platform take including subscription, ads, wallet top-up, minus referral payouts
    const totalPlatformTakeAfterReferrals =
      platformTakeNet + subscriptionNet + adsNet + walletTopupRevenue - referralPayouts;

    // Get period comparison (previous period)
    const period = startDate && endDate ? "custom" : "month";
    let previousStart: string;
    let previousEnd: string;

    if (period === "month") {
      const now = new Date();
      const _currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

      previousStart = previousMonthStart.toISOString();
      previousEnd = previousMonthEnd.toISOString();
    } else {
      // For custom dates, calculate previous period of same length
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
      const prevQuery = supabase
        .from("finance_transactions")
        .select("transaction_type, amount, fees")
        .gte("created_at", previousStart)
        .lte("created_at", previousEnd);
      const { data: prevRows } = await prevQuery;
      const prev = prevRows || [];
      const prevSum = (types: string[], field: "amount" | "fees") =>
        prev
          .filter((r: any) => types.includes(r.transaction_type))
          .reduce((s: number, r: any) => s + Number(r[field] || 0), 0);
      previousGmv =
        prevSum(["payment"], "amount") +
        prevSum(["provider_earnings"], "amount") +
        prevSum(["tip"], "amount") +
        prevSum(["tax"], "amount") +
        prevSum(["travel_fee"], "amount") +
        prevSum(["service_fee"], "amount") +
        prevSum(["additional_charge_payment"], "amount") +
        prevSum(["additional_charge_payment"], "fees");
    }

    const gmvGrowth = previousGmv > 0 ? ((serviceCollectedGross - previousGmv) / previousGmv) * 100 : 0;

    return NextResponse.json({
      data: {
        service_collected_gross: serviceCollectedGross,
        service_collected_net: serviceCollectedNet,
        gateway_fees: gatewayFeesServices,

        platform_commission_gross: platformCommissionGross,
        platform_refund_impact: platformRefundImpact,
        platform_commission_net: platformCommissionNet,
        platform_take_net: platformTakeNet,

        tips_gross: tipsGross,
        taxes_gross: taxesGross,

        subscription_collected_gross: subscriptionGross,
        subscription_net: subscriptionNet,
        subscription_gateway_fees: subscriptionGatewayFees,
        ads_net: adsNet,
        ads_gross: adsGross,
        ads_gateway_fees: adsGatewayFees,
        total_platform_take_net: platformTakeNet + subscriptionNet + adsNet,

        provider_earnings: providerEarnings,
        refunds_gross: refundsGross,
        gift_card_sales: giftCardSales,
        membership_sales: membershipSales,

        wallet_topup_revenue: walletTopupRevenue,
        referral_payouts: referralPayouts,
        total_platform_take_after_referrals: totalPlatformTakeAfterReferrals,

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

