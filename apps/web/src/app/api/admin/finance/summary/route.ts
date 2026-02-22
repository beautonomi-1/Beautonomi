import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
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

    const supabase = await getSupabaseServer();
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

    // Services (bookings + additional charges)
    const serviceCollectedNetOfFees = sum(["payment", "additional_charge_payment"], "amount");
    const gatewayFeesServices = sum(["payment", "additional_charge_payment"], "fees");
    const serviceCollectedGross = serviceCollectedNetOfFees + gatewayFeesServices;

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

    const providerEarnings = sum(["provider_earnings"], "net");

    // Other provider-linked sales (gross)
    const giftCardSales = sum(["gift_card_sale"], "amount");
    const membershipSales = sum(["membership_sale"], "amount");

    // Refund gross (customer cash-out)
    const refundsGross = -sum(["refund"], "amount"); // positive number

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
        .select("transaction_type, amount")
        .gte("created_at", previousStart)
        .lte("created_at", previousEnd);
      const { data: prevRows } = await prevQuery;
      previousGmv = (prevRows || [])
        .filter((r: any) => ["payment", "additional_charge_payment"].includes(r.transaction_type))
        .reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
    }

    const gmvGrowth = previousGmv > 0 ? ((serviceCollectedGross - previousGmv) / previousGmv) * 100 : 0;

    return NextResponse.json({
      data: {
        service_collected_gross: serviceCollectedGross,
        service_collected_net: serviceCollectedNetOfFees,
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
        total_platform_take_net: platformTakeNet + subscriptionNet,

        provider_earnings: providerEarnings,
        refunds_gross: refundsGross,
        gift_card_sales: giftCardSales,
        membership_sales: membershipSales,

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

