import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { handleApiError, successResponse } from "@/lib/supabase/api-helpers";

/**
 * GET /api/me/loyalty-points
 * Get current user's loyalty points balance and transaction history
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await getSupabaseServer();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") || "20");
    const offset = parseInt(url.searchParams.get("offset") || "0");

    // Get loyalty config
    const { data: config } = await supabase
      .from("loyalty_point_config")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    // Get current balance using function
    const { data: balanceData } = await supabase
      .rpc('get_customer_available_points', { customer_uuid: user.id });

    const available_balance = balanceData || 0;

    // Get balance summary from view
    const { data: balanceSummary } = await supabase
      .from("loyalty_points_balance")
      .select("*")
      .eq("customer_id", user.id)
      .single();

    // Get recent transactions
    const { data: transactions, error: transactionsError } = await supabase
      .from("loyalty_points_ledger")
      .select(`
        *,
        booking:bookings (
          id,
          ref_number,
          scheduled_at,
          total_amount
        )
      `)
      .eq("customer_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (transactionsError) {
      throw transactionsError;
    }

    // Calculate conversion rate display
    const redemption_rate = config?.redemption_rate || 10;
    const conversion_display = `${redemption_rate} points = R1 discount`;

    // Calculate how much can be redeemed
    const can_redeem_currency = available_balance / redemption_rate;

    return successResponse({
      balance: {
        available: available_balance,
        total_earned: balanceSummary?.total_earned || 0,
        total_redeemed: balanceSummary?.total_redeemed || 0,
        last_transaction_at: balanceSummary?.last_transaction_at,
      },
      conversion: {
        rate: redemption_rate,
        display: conversion_display,
        can_redeem_amount: can_redeem_currency,
        currency: "ZAR",
      },
      config: {
        min_redemption_points: config?.min_redemption_points || 50,
        max_redemption_percentage: config?.max_redemption_percentage || 50,
        points_expiry_days: config?.points_expiry_days || 365,
        earning_rate: config?.earning_rate || 1.0,
      },
      recent_transactions: transactions?.map(t => ({
        id: t.id,
        type: t.transaction_type,
        points: t.points_amount,
        balance_after: t.balance_after,
        description: t.description,
        booking_ref: t.booking?.ref_number,
        expires_at: t.expires_at,
        created_at: t.created_at,
        metadata: t.metadata,
      })) || [],
      pagination: {
        limit,
        offset,
        has_more: transactions && transactions.length === limit,
      },
    });

  } catch (error) {
    return handleApiError(error, "Failed to fetch loyalty points");
  }
}
