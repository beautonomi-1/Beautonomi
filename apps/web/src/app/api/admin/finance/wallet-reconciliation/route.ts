import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

interface WalletReconciliationRow {
  user_id: string;
  wallet_id: string;
  wallet_balance: number;
  transaction_sum: number;
  difference: number;
  currency: string;
  /** Joined from `users` for admin context */
  user_email: string | null;
  user_full_name: string | null;
  user_phone: string | null;
  user_role: string | null;
  /** `provider` if a providers row exists for this user; else derived from `user_role` */
  account_kind: "customer" | "provider" | "provider_staff" | "admin" | "other";
  account_kind_label: string;
  provider_id: string | null;
  provider_business_name: string | null;
}

function isMissingColumnError(error: unknown, column: string): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  const code = typeof record.code === "string" ? record.code : "";
  const message = typeof record.message === "string" ? record.message : "";
  return code === "42703" && message.includes(column);
}

type UserRow = {
  id: string;
  email?: string | null;
  full_name?: string | null;
  phone?: string | null;
  role?: string | null;
};

type ProviderRow = { id: string; user_id: string; business_name?: string | null };

function classifyWalletAccount(user: UserRow | undefined, provider: ProviderRow | undefined): {
  account_kind: WalletReconciliationRow["account_kind"];
  account_kind_label: string;
} {
  if (provider) {
    return { account_kind: "provider", account_kind_label: "Provider (business)" };
  }
  const role = (user?.role ?? "").toLowerCase();
  if (role === "customer") {
    return { account_kind: "customer", account_kind_label: "Customer" };
  }
  if (role === "provider_owner") {
    return { account_kind: "provider", account_kind_label: "Provider owner" };
  }
  if (role === "provider_staff") {
    return { account_kind: "provider_staff", account_kind_label: "Provider staff" };
  }
  if (role === "provider_onboarding") {
    return { account_kind: "provider_staff", account_kind_label: "Provider onboarding" };
  }
  if (role.startsWith("admin_") || role === "superadmin" || role === "support_agent") {
    return { account_kind: "admin", account_kind_label: "Admin / operations" };
  }
  if (role) {
    return { account_kind: "other", account_kind_label: role };
  }
  return { account_kind: "other", account_kind_label: "Unknown" };
}

function buildReconciliationRow(
  w: { id: string; user_id: string; balance?: number; currency?: string },
  computedSum: number,
  storedBalance: number,
  signedDiff: number,
  userMap: Map<string, UserRow>,
  providerMap: Map<string, ProviderRow>
): WalletReconciliationRow {
  const u = userMap.get(w.user_id);
  const p = providerMap.get(w.user_id);
  const { account_kind, account_kind_label } = classifyWalletAccount(u, p);
  return {
    user_id: w.user_id,
    wallet_id: w.id,
    wallet_balance: storedBalance,
    transaction_sum: Number(computedSum.toFixed(2)),
    difference: Number(signedDiff.toFixed(2)),
    currency: w.currency ?? "ZAR",
    user_email: u?.email ?? null,
    user_full_name: u?.full_name ?? null,
    user_phone: u?.phone ?? null,
    user_role: u?.role ?? null,
    account_kind,
    account_kind_label,
    provider_id: p?.id ?? null,
    provider_business_name: p?.business_name ?? null,
  };
}

async function loadUserAndProviderMaps(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userIds: string[]
): Promise<{ userMap: Map<string, UserRow>; providerMap: Map<string, ProviderRow> }> {
  const userMap = new Map<string, UserRow>();
  const providerMap = new Map<string, ProviderRow>();
  const uniq = Array.from(new Set(userIds)).filter(Boolean);
  const chunkSize = 200;
  for (let i = 0; i < uniq.length; i += chunkSize) {
    const chunk = uniq.slice(i, i + chunkSize);
    const { data: users, error: uErr } = await supabase
      .from("users")
      .select("id, email, full_name, phone, role")
      .in("id", chunk);
    if (uErr) throw uErr;
    for (const row of (users ?? []) as UserRow[]) {
      if (row?.id) userMap.set(row.id, row);
    }
  }
  for (let i = 0; i < uniq.length; i += chunkSize) {
    const chunk = uniq.slice(i, i + chunkSize);
    const { data: provs, error: pErr } = await supabase
      .from("providers")
      .select("id, user_id, business_name")
      .in("user_id", chunk);
    if (pErr) {
      console.warn("[wallet-reconciliation] providers select failed:", pErr.message);
      break;
    }
    for (const row of (provs ?? []) as ProviderRow[]) {
      if (row.user_id && !providerMap.has(row.user_id)) {
        providerMap.set(row.user_id, row);
      }
    }
  }
  return { userMap, providerMap };
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
          return successResponse({
            mismatches: [],
            checked_wallets: [],
            total_mismatches: 0,
            checked: 0,
            healthy: 0,
          });
        }
        walletsQuery = walletsQuery.in("id", scopedWalletIds);
      }
    }
    const { data: wallets, error: walletsError } = await walletsQuery;
    if (walletsError) throw walletsError;

    if (!wallets?.length) {
      return successResponse({
        mismatches: [],
        checked_wallets: [],
        total_mismatches: 0,
        checked: 0,
        healthy: 0,
      });
    }

    type WalletRow = { id: string; user_id: string; balance?: number; currency?: string };
    const walletRows = wallets as WalletRow[];
    const walletIds = walletRows.map((w) => w.id);

    const { userMap, providerMap } = await loadUserAndProviderMaps(
      supabase,
      walletRows.map((w) => w.user_id)
    );

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

    const mismatches: WalletReconciliationRow[] = [];
    const checked_wallets: WalletReconciliationRow[] = [];
    let healthy = 0;
    const TOLERANCE = 0.01;

    for (const w of walletRows) {
      const storedBalance = Number(w.balance ?? 0);
      const computedSum = txSumMap.get(w.id) ?? 0;
      const signedDiff = storedBalance - computedSum;
      const row = buildReconciliationRow(w, computedSum, storedBalance, signedDiff, userMap, providerMap);
      checked_wallets.push(row);
      if (Math.abs(signedDiff) > TOLERANCE) {
        mismatches.push(row);
      } else {
        healthy++;
      }
    }

    mismatches.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));

    return successResponse({
      /** Drifted wallets only (for alerts / compact views) */
      mismatches: mismatches.slice(0, 100),
      /** Every wallet examined in this run — use for full table when all are healthy */
      checked_wallets,
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
