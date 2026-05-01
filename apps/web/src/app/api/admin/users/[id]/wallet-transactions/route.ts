import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  errorResponse,
  notFoundResponse,
  getPaginationParams,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_USERS_TRUST } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { getUserRowIfAccessibleToAdminTenant } from "@/lib/tenant/admin-user-tenant-access";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

/**
 * GET /api/admin/users/[id]/wallet-transactions
 *
 * Paginated ledger rows for the user's wallet.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminSection(ADMIN_SECTION_USERS_TRUST, request);
    const { id: userId } = await params;
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const { page, limit, offset } = getPaginationParams(request);

    const accessible = await getUserRowIfAccessibleToAdminTenant(supabase, tenantId, userId);
    if (!accessible) return notFoundResponse("User not found");

    const { data: wallet, error: walletError } = await supabase
      .from("user_wallets")
      .select("id, balance, currency")
      .eq("user_id", userId)
      .maybeSingle();

    if (walletError) throw walletError;

    if (!wallet) {
      return successResponse({
        wallet: null,
        data: [],
        meta: { page: 1, limit, total: 0, has_more: false },
      });
    }

    const walletRow = wallet as { id: string; balance: number; currency: string };

    const { data: rows, error: txError, count } = await supabase
      .from("wallet_transactions")
      .select("id, type, amount, description, reference_id, reference_type, created_at", { count: "exact" })
      .eq("wallet_id", walletRow.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (txError) throw txError;

    const total = count || 0;
    return successResponse({
      wallet: { balance: walletRow.balance, currency: walletRow.currency },
      data: rows ?? [],
      meta: { page, limit, total, has_more: total > page * limit },
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch wallet transactions");
  }
}

/**
 * POST /api/admin/users/[id]/wallet-transactions
 *
 * Admin wallet top-up or adjustment using the wallet_credit_admin RPC.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: admin } = await requireAdminSection(ADMIN_SECTION_USERS_TRUST, request);
    const { id: userId } = await params;
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const body = await request.json();

    const postAccessible = await getUserRowIfAccessibleToAdminTenant(supabase, tenantId, userId);
    if (!postAccessible) return notFoundResponse("User not found");

    const amount = Number(body.amount);
    if (!amount || amount <= 0) {
      return errorResponse("Amount must be a positive number", "VALIDATION_ERROR", 400);
    }
    if (amount > 100000) {
      return errorResponse("Amount exceeds maximum allowed (100,000)", "VALIDATION_ERROR", 400);
    }

    const description = body.description?.trim() || `Admin top-up by ${admin.email}`;
    const currency = body.currency || "ZAR";

    const { data, error } = await supabase.rpc("wallet_credit_admin", {
      p_user_id: userId,
      p_amount: amount,
      p_currency: currency,
      p_description: description,
      p_reference_id: null,
      p_reference_type: "admin_topup",
      p_tenant_id: tenantId,
    });

    if (error) throw error;

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: admin.id,
      actor_role: admin.role,
      action: "admin.wallet.topup",
      entity_type: "user_wallet",
      entity_id: userId,
      module: "finance",
      risk_level: "critical",
      retention_tier: "financial",
      status: "succeeded",
      reason: description,
      after_json: { amount, currency, description },
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
      superadmin_bypass_used: admin.role === "superadmin",
    });

    return successResponse(data);
  } catch (error) {
    return handleApiError(error, "Failed to top up wallet");
  }
}
