import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, successResponse, handleApiError, getOffsetPaginationParams } from "@/lib/supabase/api-helpers";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { fetchAllPaged } from "@/lib/provider-ops/postgrest-unbounded";

const WALLET_LEDGER_RECONCILE_MAX = 100_000;

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

    // Reconcile the trigger-maintained balance against the transaction ledger.
    //
    // IMPORTANT: we sum the actual ledger rows here (credits minus debits) rather
    // than a PostgREST `amount.sum()` aggregate. The aggregate path was unreliable
    // (aggregates can be disabled at the PostgREST layer, and a null/unexpected
    // result silently summed to 0) — it then "healed" the stored balance DOWN to
    // 0 while the ledger rows remained, which is exactly the "I see the
    // transaction but my balance is still 0" / "top-up did nothing" symptom.
    //
    // We only ever self-heal when we have confidently computed the FULL ledger
    // (query succeeded AND was not truncated). Otherwise we leave the stored
    // balance untouched.
    const storedBalance = Math.round(Number(wallet.balance || 0) * 100) / 100;
    const walletForResponse = { ...wallet, balance: storedBalance };

    let ledgerRows: Array<{ type?: string; amount?: number }> = [];
    let ledgerComplete = false;
    try {
      ledgerRows = await fetchAllPaged(async (from, to) => {
        const { data, error } = await supabaseAdmin
          .from("wallet_transactions")
          .select("type, amount")
          .eq("wallet_id", wallet.id)
          .order("created_at", { ascending: true })
          .range(from, to);
        return { data, error };
      }, WALLET_LEDGER_RECONCILE_MAX);
      ledgerComplete = ledgerRows.length < WALLET_LEDGER_RECONCILE_MAX;
    } catch (ledgerError) {
      console.warn(`Wallet ledger reconcile failed for user ${user.id}:`, ledgerError);
    }

    if (ledgerComplete) {
      let creditSum = 0;
      let debitSum = 0;
      for (const tx of ledgerRows as { type?: string; amount?: number }[]) {
        const amt = Number(tx.amount ?? 0);
        if (tx.type === "debit") debitSum += amt;
        else creditSum += amt;
      }
      const normalizedLedgerBalance = Math.round((creditSum - debitSum) * 100) / 100;

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
        // A failed heal must never block the read or zero the balance — keep the
        // trigger-maintained stored balance and surface that instead.
        if (reconcileError) {
          console.warn(`Wallet self-heal update failed for user ${user.id}:`, reconcileError.message);
        } else if (reconciledWallet) {
          Object.assign(walletForResponse, reconciledWallet);
        }
      }
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

