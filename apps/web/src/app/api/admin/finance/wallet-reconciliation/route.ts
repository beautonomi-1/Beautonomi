import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

interface WalletMismatch {
  user_id: string;
  wallet_id: string;
  wallet_balance: number;
  transaction_sum: number;
  difference: number;
  currency: string;
}

/**
 * GET /api/admin/finance/wallet-reconciliation
 *
 * Compares user_wallets.balance against the computed sum of wallet_transactions
 * (credits minus debits) for each wallet. Returns mismatches where the stored
 * balance differs from the computed sum.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    if (!user) {
      return handleApiError(new Error("Unauthorized"), "AUTH_REQUIRED", 401);
    }

    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    let walletsQuery = supabase
      .from("user_wallets")
      .select("id, user_id, balance, currency")
      .order("updated_at", { ascending: false })
      .limit(1000);
    if (tenantId) {
      walletsQuery = walletsQuery.eq("tenant_id", tenantId);
    }
    const { data: wallets, error: walletsError } = await walletsQuery;
    if (walletsError) throw walletsError;

    if (!wallets?.length) {
      return successResponse({ mismatches: [], checked: 0, healthy: 0 });
    }

    type WalletRow = { id: string; user_id: string; balance?: number; currency?: string };
    const walletRows = wallets as WalletRow[];
    const walletIds = walletRows.map((w) => w.id);

    // Sum wallet_transactions per wallet_id in chunks.
    // wallet_transactions uses `type` ('credit'|'debit') with positive `amount`.
    const chunkSize = 200;
    const txSumMap = new Map<string, number>();
    for (let i = 0; i < walletIds.length; i += chunkSize) {
      const chunk = walletIds.slice(i, i + chunkSize);
      const { data: txRows } = await supabase
        .from("wallet_transactions")
        .select("wallet_id, type, amount")
        .in("wallet_id", chunk);

      for (const tx of (txRows ?? []) as { wallet_id: string; type?: string; amount?: number }[]) {
        const amt = Number(tx.amount ?? 0);
        const signed = tx.type === "debit" ? -amt : amt;
        txSumMap.set(tx.wallet_id, (txSumMap.get(tx.wallet_id) ?? 0) + signed);
      }
    }

    const mismatches: WalletMismatch[] = [];
    let healthy = 0;
    const TOLERANCE = 0.01;

    for (const w of walletRows) {
      const storedBalance = Number(w.balance ?? 0);
      const computedSum = txSumMap.get(w.id) ?? 0;
      const diff = Math.abs(storedBalance - computedSum);
      if (diff > TOLERANCE) {
        mismatches.push({
          user_id: w.user_id,
          wallet_id: w.id,
          wallet_balance: storedBalance,
          transaction_sum: Number(computedSum.toFixed(2)),
          difference: Number((storedBalance - computedSum).toFixed(2)),
          currency: w.currency ?? "ZAR",
        });
      } else {
        healthy++;
      }
    }

    mismatches.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));

    return successResponse({
      mismatches: mismatches.slice(0, 100),
      total_mismatches: mismatches.length,
      checked: walletRows.length,
      healthy,
    });
  } catch (error) {
    return handleApiError(error, "Failed to run wallet reconciliation");
  }
}
