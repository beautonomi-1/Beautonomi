/**
 * POST /api/provider/subscription/receipts/[financeTxId]/signed-url
 *
 * Mint a short-lived HMAC-signed URL so the native provider app can open the
 * subscription payment receipt PDF directly (no Bearer on the final GET).
 * Keyed on finance_transactions.id (one-off orders + recurring renewals).
 */

import { NextRequest } from "next/server";
import {
  requireAuthInApi,
  successResponse,
  handleApiError,
  errorResponse,
  userHasProviderAccessAdmin,
} from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  hasReceiptDownloadSigningSecret,
  mintReceiptDownloadToken,
  resolveReceiptDownloadOrigin,
} from "@/lib/receipts/receipt-download-token";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ financeTxId: string }> },
) {
  try {
    const { user: authUser } = await requireAuthInApi(request);
    const { financeTxId } = await params;
    if (!financeTxId) return errorResponse("Receipt id is required", "VALIDATION_ERROR", 400);

    const admin = getSupabaseAdmin();
    const { data: tx } = await admin
      .from("finance_transactions")
      .select("id, provider_id, transaction_type")
      .eq("id", financeTxId)
      .maybeSingle();

    if (!tx) return errorResponse("Receipt not found", "NOT_FOUND", 404);
    if ((tx as { transaction_type?: string }).transaction_type !== "provider_subscription_payment") {
      return errorResponse(
        "A receipt is only available for subscription payments.",
        "NOT_SUBSCRIPTION",
        409,
      );
    }

    const { data: userRow } = await admin
      .from("users")
      .select("id, role")
      .eq("id", authUser.id)
      .maybeSingle();
    const isSuperadmin = userRow?.role === "superadmin";

    const pid = (tx as { provider_id: string | null }).provider_id;
    if (!pid) return errorResponse("Receipt not found", "NOT_FOUND", 404);
    if (!isSuperadmin && !(await userHasProviderAccessAdmin(admin, authUser.id, pid))) {
      return errorResponse(
        "You don't have access to this receipt.",
        "FORBIDDEN",
        403,
      );
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
      kind: "provider_subscription_receipt",
      subjectId: financeTxId,
      userId: authUser.id,
      ttlSeconds,
    });
    const url = `${origin}/api/provider/subscription/receipts/${encodeURIComponent(financeTxId)}/pdf?token=${encodeURIComponent(token)}`;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

    return successResponse({ url, expires_at: expiresAt });
  } catch (error) {
    return handleApiError(error, "Failed to mint subscription receipt download URL");
  }
}
