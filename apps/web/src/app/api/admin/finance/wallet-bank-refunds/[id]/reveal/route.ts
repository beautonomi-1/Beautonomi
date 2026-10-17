import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  notFoundResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog } from "@/lib/audit/audit";
import { decryptSensitiveField } from "@/lib/security/field-encryption";
import { checkRateLimit } from "@/lib/rate-limit/store";

const REVEAL_LIMIT = { prefix: "wallet-bank-refund-reveal", limit: 20, windowSeconds: 3600 };

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const { id } = await params;
    const tenantId = await resolveAdminApiTenantId(request);
    const supabase = getSupabaseAdmin();

    const rate = await checkRateLimit(REVEAL_LIMIT, user.id);
    if (!rate.allowed) {
      return errorResponse("Too many account-number reveals. Try again later.", "RATE_LIMITED", 429);
    }

    const { data: row } = await supabase
      .from("wallet_bank_refund_requests")
      .select("id, tenant_id, request_number, status, account_number_encrypted, account_number_last4")
      .eq("id", id)
      .maybeSingle();
    if (!row || row.tenant_id !== tenantId) {
      return notFoundResponse("Request not found");
    }

    const encrypted = row.account_number_encrypted ? String(row.account_number_encrypted) : "";
    const accountNumber = encrypted ? decryptSensitiveField(encrypted) : null;
    if (!accountNumber) {
      return errorResponse("No encrypted account number on this request.", "NOT_AVAILABLE", 404);
    }

    await writeAuditLog({
      actor_user_id: user.id,
      action: "admin.wallet_bank_refund.reveal",
      entity_type: "wallet_bank_refund_request",
      entity_id: id,
      retention_tier: "financial",
      metadata: {
        request_number: row.request_number,
        last4: row.account_number_last4,
        status: row.status,
      },
    });

    return successResponse({
      account_number: accountNumber,
      account_number_last4: row.account_number_last4 ?? null,
    });
  } catch (error) {
    return handleApiError(error, "Failed to reveal bank account number");
  }
}
