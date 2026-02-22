import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getPaginationParams } from "@/lib/supabase/api-helpers";

/**
 * GET /api/admin/payouts
 * 
 * Get payout queue with filters
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"]);
    const supabase = await getSupabaseServer();

    if (!supabase) {
      return NextResponse.json({
        data: [],
        error: null,
        meta: {
          page: 1,
          limit: 50,
          total: 0,
          has_more: false,
        },
      });
    }

    const { searchParams } = new URL(request.url);
    const { page, limit, offset } = getPaginationParams(request);

    const status = searchParams.get("status"); // pending, processing, completed, failed
    const providerId = searchParams.get("provider_id");

    // Fetch payouts without joins
    let query = supabase
      .from("payouts")
      .select("*", { count: "exact" });

    // Apply filters
    if (status && status !== "all") {
      query = query.eq("status", status);
    }
    if (providerId) {
      query = query.eq("provider_id", providerId);
    }

    // Apply pagination
    const { data: payouts, error, count } = await query
      .order("scheduled_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("Error fetching payouts:", error);
      return NextResponse.json({
        data: [],
        error: null,
        meta: {
          page,
          limit,
          total: 0,
          has_more: false,
        },
      });
    }

    if (!payouts || payouts.length === 0) {
      return NextResponse.json({
        data: [],
        error: null,
        meta: {
          page,
          limit,
          total: 0,
          has_more: false,
        },
      });
    }

    // Fetch provider data separately
    const providerIds = [
      ...new Set(payouts.map((p: any) => p.provider_id).filter(Boolean)),
    ];

    let providerMap = new Map();
    if (providerIds.length > 0) {
      const { data: providers } = await supabase
        .from("providers")
        .select("id, business_name, slug")
        .in("id", providerIds);

      if (providers) {
        providerMap = new Map(providers.map((p: any) => [p.id, p]));
      }
    }

    // Fetch bank account data for payouts
    const recipientCodes = payouts
      .map((p: any) => p.recipient_code)
      .filter(Boolean);
    
    let bankAccountMap = new Map();
    if (recipientCodes.length > 0) {
      const { data: bankAccounts } = await supabase
        .from("provider_payout_accounts")
        .select("recipient_code, account_name, account_number_last4, bank_name, bank_code")
        .in("recipient_code", recipientCodes)
        .eq("active", true)
        .is("deleted_at", null);

      if (bankAccounts) {
        bankAccountMap = new Map(
          bankAccounts.map((acc: any) => [acc.recipient_code, acc])
        );
      }
    }

    // Transform payouts to include provider and bank account data
    const enrichedPayouts = payouts.map((payout: any) => ({
      ...payout,
      provider: payout.provider_id
        ? providerMap.get(payout.provider_id) || null
        : null,
      bank_account: payout.recipient_code
        ? bankAccountMap.get(payout.recipient_code) || null
        : null,
    }));

    return NextResponse.json({
      data: enrichedPayouts,
      error: null,
      meta: {
        page,
        limit,
        total: count || 0,
        has_more: (count || 0) > offset + limit,
      },
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/payouts:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: error instanceof Error ? error.message : "Failed to fetch payouts",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

