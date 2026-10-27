import { NextRequest } from "next/server";
import {
  successResponse,
  handleApiError,
  errorResponse,
  userHasProviderAccessAdmin,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  hasReceiptDownloadSigningSecret,
  mintReceiptDownloadToken,
  resolveReceiptDownloadOrigin,
} from "@/lib/receipts/receipt-download-token";

const ALLOWED = new Set([
  "provider_marketing_credit_topup",
  "provider_marketing_credit_refund",
]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ financeTxId: string }> },
) {
  try {
    const permissionCheck = await requirePermission("manage_finance", request);
    if (!permissionCheck.authorized) return permissionCheck.response!;
    const authUser = permissionCheck.user!;

    const { financeTxId } = await params;
    if (!financeTxId) return errorResponse("Receipt id is required", "VALIDATION_ERROR", 400);

    const admin = getSupabaseAdmin();
    const { data: tx } = await admin
      .from("finance_transactions")
      .select("id, provider_id, transaction_type")
      .eq("id", financeTxId)
      .maybeSingle();

    if (!tx) return errorResponse("Receipt not found", "NOT_FOUND", 404);
    const txType = (tx as { transaction_type?: string }).transaction_type;
    if (!txType || !ALLOWED.has(txType)) {
      return errorResponse(
        "A receipt is only available for marketing credit payments.",
        "NOT_MARKETING_CREDIT",
        409,
      );
    }

    const pid = (tx as { provider_id: string | null }).provider_id;
    if (!pid) return errorResponse("Receipt not found", "NOT_FOUND", 404);
    if (!(await userHasProviderAccessAdmin(admin, authUser.id, pid))) {
      return errorResponse("You don't have access to this receipt.", "FORBIDDEN", 403);
    }

    if (!hasReceiptDownloadSigningSecret()) {
      return errorResponse(
        "Receipt download is not available right now. Please try again later.",
        "CONFIG_ERROR",
        500,
      );
    }

    const origin = resolveReceiptDownloadOrigin();
    if (!origin) {
      return errorResponse(
        "App URL is not configured for receipt links. Set NEXT_PUBLIC_APP_URL.",
        "CONFIG_ERROR",
        500,
      );
    }

    const ttlSeconds = 5 * 60;
    const token = mintReceiptDownloadToken({
      kind: "provider_marketing_credit_receipt",
      subjectId: financeTxId,
      userId: authUser.id,
      ttlSeconds,
    });
    const url = `${origin}/api/provider/finance/marketing-credit/receipts/${encodeURIComponent(financeTxId)}/pdf?token=${encodeURIComponent(token)}`;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

    return successResponse({ url, expires_at: expiresAt });
  } catch (error) {
    return handleApiError(error, "Failed to mint marketing credit receipt URL");
  }
}
