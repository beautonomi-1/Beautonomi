import { NextRequest, NextResponse } from "next/server";
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

function isMissingColumnError(error: unknown, column: string): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  const code = typeof record.code === "string" ? record.code : "";
  const message = typeof record.message === "string" ? record.message : "";
  return code === "42703" && message.includes(column);
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
      const { data: tenantWalletRows, error: tenantWalletsError } = await supabase
        .from("wallet_transactions")
        .select("wallet_id")
        .eq("tenant_id", tenantId)
        .limit(5000);

      if (tenantWalletsError) {
        if (isMissingColumnError(tenantWalletsError, "tenant_id")) {
          console.warn(
            "[wallet-reconciliation] wallet_transactions.tenant_id missing, continuing without tenant scoping"
          );
        } else {
          throw tenantWalletsError;
        }
      } else {
        const scopedWalletIds = Array.from(
          new Set((tenantWalletRows ?? []).map((row: { wallet_id?: string }) => row.wallet_id).filter(Boolean))
        );
        if (scopedWalletIds.length === 0) {
          return successResponse({ mismatches: [], checked: 0, healthy: 0 });
        }
        walletsQuery = walletsQuery.in("id", scopedWalletIds);
      }
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

/**
 * PATCH /api/admin/finance/wallet-reconciliation
 *
 * Corrects the stored balance on a wallet to match the computed transaction sum.
 * Body: { wallet_id: string }
 */
export async function PATCH(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    if (!user) {
      return handleApiError(new Error("Unauthorized"), "AUTH_REQUIRED", 401);
    }

    const body = await request.json();
    const walletId: string | undefined = body?.wallet_id;
    if (!walletId) {
      return NextResponse.json({ error: "wallet_id is required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const { data: wallet, error: wErr } = await supabase
      .from("user_wallets")
      .select("id, user_id, balance")
      .eq("id", walletId)
      .single();
    const tenantId = await resolveAdminApiTenantId(request);
    if (tenantId) {
      const { data: tenantScopedTx, error: tenantCheckError } = await supabase
        .from("wallet_transactions")
        .select("wallet_id")
        .eq("wallet_id", walletId)
        .eq("tenant_id", tenantId)
        .limit(1);

      if (tenantCheckError) {
        if (!isMissingColumnError(tenantCheckError, "tenant_id")) {
          throw tenantCheckError;
        }
      } else if (!tenantScopedTx || tenantScopedTx.length === 0) {
        return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
      }
    }

    if (wErr || !wallet) {
      return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
    }

    const { data: txRows } = await supabase
      .from("wallet_transactions")
      .select("type, amount")
      .eq("wallet_id", walletId);

    let computedBalance = 0;
    for (const tx of (txRows ?? []) as { type?: string; amount?: number }[]) {
      const amt = Number(tx.amount ?? 0);
      computedBalance += tx.type === "debit" ? -amt : amt;
    }
    computedBalance = Math.max(0, Number(computedBalance.toFixed(2)));

    const { error: updateErr } = await supabase
      .from("user_wallets")
      .update({ balance: computedBalance, updated_at: new Date().toISOString() })
      .eq("id", walletId);

    if (updateErr) throw updateErr;

    return successResponse({
      wallet_id: walletId,
      previous_balance: Number((wallet as { balance?: number }).balance ?? 0),
      corrected_balance: computedBalance,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fix wallet balance");
  }
}
