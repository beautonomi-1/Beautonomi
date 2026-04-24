/**
 * POST /api/me/orders/[id]/receipt/signed-url
 *
 * Mint a short-lived HMAC-signed URL that the native customer app can open
 * directly in a system PDF viewer (no Bearer header needed on the final
 * GET). The token binds order id + user id + expiry.
 *
 * Authorization: the caller must be the order owner (or a superadmin).
 */

import { NextRequest } from "next/server";
import {
  requireAuthInApi,
  successResponse,
  handleApiError,
  errorResponse,
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
      .select("id, customer_id")
      .eq("id", id)
      .maybeSingle();

    if (!order) {
      return errorResponse("Order not found", "NOT_FOUND", 404);
    }

    const { data: userRow } = await admin
      .from("users")
      .select("id, role")
      .eq("id", authUser.id)
      .maybeSingle();
    const isSuperadmin = userRow?.role === "superadmin";
    const isOwner = order.customer_id === authUser.id;

    if (!isOwner && !isSuperadmin) {
      return errorResponse(
        "You don't have access to this order's receipt.",
        "FORBIDDEN",
        403,
      );
    }

    if (!hasReceiptDownloadSigningSecret()) {
      console.error(
        "Order receipt signed-url: set RECEIPT_DOWNLOAD_TOKEN_SECRET or RETENTION_LINK_SECRET.",
      );
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
      kind: "customer_order_receipt",
      subjectId: id,
      userId: authUser.id,
      ttlSeconds,
    });
    const url = `${origin}/api/me/orders/${encodeURIComponent(id)}/receipt/pdf?token=${encodeURIComponent(token)}`;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

    return successResponse({ url, expires_at: expiresAt });
  } catch (error) {
    return handleApiError(error, "Failed to mint order receipt download URL");
  }
}
