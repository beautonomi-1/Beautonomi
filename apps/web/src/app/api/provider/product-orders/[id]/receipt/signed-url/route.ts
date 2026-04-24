/**
 * POST /api/provider/product-orders/[id]/receipt/signed-url
 *
 * Mint a short-lived HMAC-signed URL so the native provider app can open
 * the order receipt PDF directly (no Bearer on the final GET).
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
    if (!id) return errorResponse("Order id is required", "VALIDATION_ERROR", 400);

    const admin = getSupabaseAdmin();
    const { data: order } = await admin
      .from("product_orders")
      .select("id, provider_id")
      .eq("id", id)
      .maybeSingle();

    if (!order) return errorResponse("Order not found", "NOT_FOUND", 404);

    const { data: userRow } = await admin
      .from("users")
      .select("id, role")
      .eq("id", authUser.id)
      .maybeSingle();
    const isSuperadmin = userRow?.role === "superadmin";

    const pid = order.provider_id as string;
    if (
      !isSuperadmin &&
      !(await userHasProviderAccessAdmin(admin, authUser.id, pid))
    ) {
      return errorResponse(
        "You don't have access to this order's receipt.",
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
      kind: "provider_order_receipt",
      subjectId: id,
      userId: authUser.id,
      ttlSeconds,
    });
    const url = `${origin}/api/provider/product-orders/${encodeURIComponent(id)}/receipt/pdf?token=${encodeURIComponent(token)}`;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

    return successResponse({ url, expires_at: expiresAt });
  } catch (error) {
    return handleApiError(error, "Failed to mint order receipt download URL");
  }
}
