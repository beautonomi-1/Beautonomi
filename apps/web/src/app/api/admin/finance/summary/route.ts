import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection } from "@/lib/supabase/api-helpers";
import { unauthorizedResponse } from "@/lib/auth/requireRole";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { fetchFinanceLedgerRowsForTenant } from "@/lib/admin/finance-ledger-tenant";

/**
 * GET /api/admin/finance/summary
 *
 * Get financial summary (GMV, fees, net, provider earnings)
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

    type FinanceRow = {
      transaction_type: string;
      amount?: number | null;
      fees?: number | null;
      commission?: number | null;
      net?: number | null;
    };
    const sum = (
      types: string[],
      field: "amount" | "fees" | "commission" | "net" = "amount"
    ) =>
      tx
        .filter((r: FinanceRow) => types.includes(r.transaction_type))
        .reduce((s: number, r: FinanceRow) => s + Number(r[field] ?? 0), 0);

    // Gateway fees (only on payment and additional_charge_payment)
    const gatewayFeesServices = sum(["payment", "additional_charge_payment"], "fees");

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

    const platformCommissionGross = sum(["payment", "additional_charge_payment"], "net");
    const platformRefundImpact = sum(["refund"], "net");
    const platformCommissionNet = platformCommissionGross + platformRefundImpact;

    const platformTakeNet = platformCommissionNet - gatewayFeesServices;

    const tipsGross = sum(["tip"], "amount");
    const taxesGross = sum(["tax"], "amount");

    const subscriptionNet = sum(["provider_subscription_payment"], "net");
    const subscriptionGatewayFees = sum(["provider_subscription_payment"], "fees");
    const subscriptionGross = subscriptionNet + subscriptionGatewayFees;

    const adsNet = sum(["provider_ads_payment"], "net");
    const adsGatewayFees = sum(["provider_ads_payment"], "fees");
    const adsGross = adsNet + adsGatewayFees;

    const providerEarnings = sum(["provider_earnings"], "net");

    const giftCardSales = sum(["gift_card_sale"], "amount");
    const membershipSales = sum(["membership_sale"], "amount");

    const refundsGross = sum(["refund"], "amount");

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
        console.warn("Wallet topups tenant scope failed, falling back to unscoped sum:", topErr.message);
        let fallback = supabaseAdmin.from("wallet_topups").select("amount").eq("status", "paid");
        if (startDate) fallback = fallback.gte("paid_at", startDate);
        if (endDate) fallback = fallback.lte("paid_at", endDate);
        const { data: fb } = await fallback;
        walletTopupRevenue = (fb || []).reduce((s, r) => s + Number(r.amount || 0), 0);
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
        console.warn("Referral payouts tenant scope failed, falling back to unscoped sum:", refErr.message);
        let refFb = supabaseAdmin
          .from("wallet_transactions")
          .select("amount")
          .eq("type", "credit")
          .eq("reference_type", "referral");
        if (startDate) refFb = refFb.gte("created_at", startDate);
        if (endDate) refFb = refFb.lte("created_at", endDate);
        const { data: rfb } = await refFb;
        referralPayouts = (rfb || []).reduce((s, r) => s + Number(r.amount || 0), 0);
      } else {
        referralPayouts = (refTxs || []).reduce((s, r) => s + Number(r.amount || 0), 0);
      }
    } catch (e) {
      console.warn("Wallet/referral counts failed:", e);
    }

    const totalPlatformTakeAfterReferrals =
      platformTakeNet + subscriptionNet + adsNet + walletTopupRevenue - referralPayouts;

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
      type PrevRow = { transaction_type: string; amount?: number | null; fees?: number | null };
      const prevSum = (types: string[], field: "amount" | "fees") =>
        prev
          .filter((r: PrevRow) => types.includes(r.transaction_type))
          .reduce((s: number, r: PrevRow) => s + Number(r[field] ?? 0), 0);
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
