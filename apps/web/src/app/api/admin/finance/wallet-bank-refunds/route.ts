import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSectionAny,
  getEffectiveAdminSectionRoles,
  successResponse,
  handleApiError,
  getPaginationParams,
} from "@/lib/supabase/api-helpers";
import {
  ADMIN_SECTION_FINANCE,
  ADMIN_SECTION_PROVIDERS_OPERATIONS,
  canAccessSection,
} from "@/lib/admin-sections";
import type { UserRole } from "@/types/beautonomi";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { decryptSensitiveField } from "@/lib/security/field-encryption";
import { serializeWalletBankRefundRequest } from "@/lib/wallet-bank-refunds/serialize";
import { writeAuditLog } from "@/lib/audit/audit";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAdminSectionAny(
      [ADMIN_SECTION_FINANCE, ADMIN_SECTION_PROVIDERS_OPERATIONS],
      request,
    );
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const { page, limit, offset } = getPaginationParams(request);

    const isFinance =
      user.role === "superadmin" ||
      canAccessSection(
        user.role as UserRole,
        ADMIN_SECTION_FINANCE,
        await getEffectiveAdminSectionRoles(request),
      );
    // Full account numbers are only revealed to finance, and only for approved requests awaiting EFT.
    const includeAccountNumber = isFinance && searchParams.get("include_account_number") === "1";

    let q = supabase
      .from("wallet_bank_refund_requests")
      .select(
        `
        *,
        customer:users!wallet_bank_refund_requests_user_id_fkey(id, full_name, email)
      `,
        { count: "exact" },
      )
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status && status !== "all") {
      q = q.eq("status", status);
    }

    const { data, error, count } = await q;
    if (error) throw error;

    const [{ count: pendingCount }, { count: approvedCount }] = await Promise.all([
      supabase
        .from("wallet_bank_refund_requests")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "pending"),
      supabase
        .from("wallet_bank_refund_requests")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "approved"),
    ]);

    const revealed: string[] = [];
    const requests = (data || []).map((raw) => {
      const row = raw as Record<string, unknown>;
      const base = serializeWalletBankRefundRequest(row);
      if (includeAccountNumber && row.status === "approved" && row.account_number_encrypted) {
        revealed.push(String(row.id));
        return {
          ...base,
          account_number: decryptSensitiveField(String(row.account_number_encrypted)),
        };
      }
      return base;
    });

    if (revealed.length > 0) {
      await writeAuditLog({
        actor_user_id: user.id,
        action: "wallet_bank_refund_account_number_view",
        entity_type: "wallet_bank_refund_request",
        entity_id: revealed.length === 1 ? revealed[0] : null,
        retention_tier: "financial",
        metadata: { request_ids: revealed },
      });
    }

    return successResponse({
      can_manage: isFinance,
      requests,
      pagination: {
        page,
        limit,
        total: count ?? 0,
        total_pages: Math.ceil((count ?? 0) / limit) || 1,
      },
      summary: {
        pending: pendingCount ?? 0,
        approved_awaiting_eft: approvedCount ?? 0,
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to list wallet bank refund requests");
  }
}
