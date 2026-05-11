import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, successResponse, handleApiError, getOffsetPaginationParams } from "@/lib/supabase/api-helpers";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["customer", "provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const supabaseAdmin = getSupabaseAdmin();

    const tenantId = await resolveTenantIdWithZaFallback(request);
    const tenantRegion = tenantId ? await getTenantRegionConfig(tenantId) : null;
    const walletCurrencyDefault = tenantRegion?.defaultCurrency || LAST_RESORT_CURRENCY;
    const { limit, offset } = getOffsetPaginationParams(request, { defaultLimit: 50, maxLimit: 100 });

    // Ensure wallet exists (created on signup, but be defensive)
    const { data: walletExisting } = await supabaseAdmin
      .from("user_wallets")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!walletExisting) {
      await supabaseAdmin.from("user_wallets").insert({ user_id: user.id, currency: walletCurrencyDefault });
    }

    const { data: wallet, error: walletError } = await supabaseAdmin
      .from("user_wallets")
      .select("id, user_id, balance, currency, updated_at, created_at")
      .eq("user_id", user.id)
      .single();
    if (walletError) throw walletError;

    // Reconcile balance using a DB-side aggregate (O(1) index scan, not a full row fetch).
    // wallet.balance is trigger-maintained; we verify it and self-heal if it drifted.
    const { data: aggRows } = await supabaseAdmin
      .from("wallet_transactions")
      .select("type, amount.sum()")
      .eq("wallet_id", wallet.id);
    const aggList = (aggRows ?? []) as { type: string; sum: number }[];
    const creditSum = aggList.find((r) => r.type === "credit")?.sum ?? 0;
    const debitSum = aggList.find((r) => r.type === "debit")?.sum ?? 0;
    const normalizedLedgerBalance = Math.round((Number(creditSum) - Number(debitSum)) * 100) / 100;
    const storedBalance = Math.round(Number(wallet.balance || 0) * 100) / 100;
    const walletForResponse = { ...wallet, balance: storedBalance };

    if (Math.abs(normalizedLedgerBalance - storedBalance) > 0.01) {
      console.warn(
        `Wallet balance drift for user ${user.id}: stored=${storedBalance}, ledger=${normalizedLedgerBalance}. Healing.`,
      );
      const { data: reconciledWallet, error: reconcileError } = await supabaseAdmin
        .from("user_wallets")
        .update({ balance: normalizedLedgerBalance })
        .eq("id", wallet.id)
        .select("id, user_id, balance, currency, updated_at, created_at")
        .single();
      if (reconcileError) throw reconcileError;
      Object.assign(walletForResponse, reconciledWallet);
    }

    const { data: txs, error: txError, count: txCount } = await supabaseAdmin
      .from("wallet_transactions")
      .select("id, wallet_id, type, amount, description, reference_id, reference_type, tenant_id, created_at", { count: "exact" })
      .eq("wallet_id", wallet.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (txError) throw txError;

    return successResponse({
      wallet: walletForResponse,
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

