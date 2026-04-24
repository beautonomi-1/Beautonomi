/**
 * POST /api/provider/invoices/[id]/signed-url
 *
 * Mint a short-lived HMAC-signed URL so the native provider app can open
 * the invoice PDF directly (no Bearer on the final GET). This avoids the
 * "Sign in required" prompt when the in-app access token is stale.
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
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user: authUser } = await requireAuthInApi(request);
    const { id } = await params;
    if (!id) return errorResponse("Invoice id is required", "VALIDATION_ERROR", 400);

    const admin = getSupabaseAdmin();
    const { data: invoice } = await admin
      .from("provider_invoices")
      .select("id, provider_id")
      .eq("id", id)
      .maybeSingle();

    if (!invoice) return errorResponse("Invoice not found", "NOT_FOUND", 404);

    const { data: userRow } = await admin
      .from("users")
      .select("id, role")
      .eq("id", authUser.id)
      .maybeSingle();
    const isSuperadmin = userRow?.role === "superadmin";

    const pid = invoice.provider_id as string;
    if (
      !isSuperadmin &&
      !(await userHasProviderAccessAdmin(admin, authUser.id, pid))
    ) {
      return errorResponse(
        "You don't have access to this invoice.",
        "FORBIDDEN",
        403,
      );
    }

    if (!hasReceiptDownloadSigningSecret()) {
      return errorResponse(
        "Invoice download is not available right now. Please try again later.",
        "CONFIG_ERROR",
        500,
      );
    }

    const origin = resolveReceiptDownloadOrigin();
    if (!origin) {
      return errorResponse(
        "App URL is not configured for invoice links. Set NEXT_PUBLIC_APP_URL.",
        "CONFIG_ERROR",
        500,
      );
    }

    const ttlSeconds = 5 * 60;
    const token = mintReceiptDownloadToken({
      kind: "provider_invoice",
      subjectId: id,
      userId: authUser.id,
      ttlSeconds,
    });
    const url = `${origin}/api/provider/invoices/${encodeURIComponent(id)}/download?token=${encodeURIComponent(token)}`;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

    return successResponse({ url, expires_at: expiresAt });
  } catch (error) {
    return handleApiError(error, "Failed to mint invoice download URL");
  }
}
