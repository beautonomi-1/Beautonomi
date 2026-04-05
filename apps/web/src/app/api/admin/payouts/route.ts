import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, getPaginationParams  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

/**
 * GET /api/admin/payouts
 * 
 * Get payout queue with filters
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

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

    // Payouts scoped via provider → tenant (service role bypasses RLS)
    let query = supabase
      .from("payouts")
      .select("*, providers!inner(tenant_id)", { count: "exact" })
      .eq("providers.tenant_id", tenantId);

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
    type PayoutRow = { provider_id?: string; recipient_code?: string; [key: string]: unknown };
    const providerIds = [...new Set((payouts as PayoutRow[]).map((p) => p.provider_id).filter(Boolean))];

    let providerMap = new Map<string, { id: string; business_name?: string; slug?: string }>();
    if (providerIds.length > 0) {
      const { data: providers } = await supabase
        .from("providers")
        .select("id, business_name, slug")
        .eq("tenant_id", tenantId)
        .in("id", providerIds);
      if (providers) {
        providerMap = new Map(providers.map((p: { id: string; business_name?: string; slug?: string }) => [p.id, p]));
      }
    }

    const recipientCodes = (payouts as PayoutRow[]).map((p) => p.recipient_code).filter(Boolean);

    let bankAccountByRecipient = new Map<string, { recipient_code?: string; account_name?: string; account_number_last4?: string; bank_name?: string; bank_code?: string }>();
    if (recipientCodes.length > 0) {
      const { data: bankAccounts } = await supabase
        .from("provider_payout_accounts")
        .select("recipient_code, account_name, account_number_last4, bank_name, bank_code")
        .in("recipient_code", recipientCodes)
        .eq("active", true)
        .is("deleted_at", null);
      if (bankAccounts) {
        type AccRow = { recipient_code?: string };
        bankAccountByRecipient = new Map(
          bankAccounts.map((acc: AccRow) => [acc.recipient_code ?? "", acc])
        );
      }
    }

    // For payouts without recipient_code (e.g. pending), use provider's active payout account for display
    const bankAccountByProviderId = new Map();
    if (providerIds.length > 0) {
      const { data: providerAccounts } = await supabase
        .from("provider_payout_accounts")
        .select("provider_id, account_name, account_number_last4, bank_name, bank_code")
        .in("provider_id", providerIds)
        .eq("active", true)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      // One row per provider (latest); if multiple active, first wins
      if (providerAccounts) {
        for (const acc of providerAccounts) {
          if (!bankAccountByProviderId.has(acc.provider_id)) {
            bankAccountByProviderId.set(acc.provider_id, acc);
          }
        }
      }
    }

    type PayoutWithScope = PayoutRow & { providers?: unknown };
    const enrichedPayouts = (payouts as PayoutWithScope[]).map((payout) => {
      const { providers: _tenantScope, ...payoutRest } = payout;
      void _tenantScope;
      const bankFromRecipient = payoutRest.recipient_code
        ? bankAccountByRecipient.get(payoutRest.recipient_code) || null
        : null;
      const bankFromProvider =
        !bankFromRecipient && payoutRest.provider_id
          ? bankAccountByProviderId.get(payoutRest.provider_id) || null
          : null;
      return {
        ...payoutRest,
        provider: payoutRest.provider_id
          ? providerMap.get(payoutRest.provider_id) || null
          : null,
        bank_account: bankFromRecipient || bankFromProvider || null,
      };
    });

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

