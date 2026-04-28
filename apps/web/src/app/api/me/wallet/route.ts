import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError, getOffsetPaginationParams } from "@/lib/supabase/api-helpers";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["customer", "provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer(request);

    const tenantId = await resolveTenantIdWithZaFallback(request);
    const tenantRegion = tenantId ? await getTenantRegionConfig(tenantId) : null;
    const walletCurrencyDefault = tenantRegion?.defaultCurrency || LAST_RESORT_CURRENCY;
    const { limit, offset } = getOffsetPaginationParams(request, { defaultLimit: 50, maxLimit: 100 });

    // Ensure wallet exists (created on signup, but be defensive)
    const { data: walletExisting } = await supabase
      .from("user_wallets")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!walletExisting) {
      await supabase.from("user_wallets").insert({ user_id: user.id, currency: walletCurrencyDefault });
    }

    const { data: wallet, error: walletError } = await supabase
      .from("user_wallets")
      .select("id, user_id, balance, currency, updated_at, created_at")
      .eq("user_id", user.id)
      .single();
    if (walletError) throw walletError;

    const { data: txs, error: txError, count: txCount } = await supabase
      .from("wallet_transactions")
      .select("id, wallet_id, type, amount, description, reference_id, reference_type, tenant_id, created_at", { count: "exact" })
      .eq("wallet_id", wallet.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (txError) throw txError;

    return successResponse({
      wallet,
      transactions: txs || [],
      pagination: {
        limit,
        offset,
        total: txCount ?? 0,
        has_more: offset + limit < (txCount ?? 0),
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch wallet");
  }
}

