/**
 * POST /api/bookings/[id]/receipt/signed-url
 *
 * §Customer-launch (audit 2026-04): mints a 5-minute HMAC-signed URL that
 * the native customer app can open in a system PDF viewer without sending
 * a `Bearer` token. Same approach as the provider-side signed-url route;
 * the token binds booking id + user id + expiry, and the PDF route
 * validates it on its end.
 *
 * Authorization: the caller must be the booking's customer (owner),
 * someone with access via the provider side (owner/staff), or a
 * superadmin. This mirrors /api/bookings/[id]/receipt/route.ts.
 */

import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { mintReceiptDownloadToken } from "@/lib/receipts/receipt-download-token";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request,
    );
    const { id } = await params;
    if (!id) return errorResponse("Booking id is required", "VALIDATION_ERROR", 400);

    const admin = getSupabaseAdmin();
    const { data: booking } = await admin
      .from("bookings")
      .select("id, customer_id, provider_id")
      .eq("id", id)
      .maybeSingle();

    if (!booking) {
      return errorResponse("Booking not found", "NOT_FOUND", 404);
    }

    const isCustomer = booking.customer_id === user.id;
    const isSuperadmin = (user as { role?: string }).role === "superadmin";

    let isProviderSide = false;
    if (!isCustomer && !isSuperadmin) {
      const { data: providerRow } = await admin
        .from("providers")
        .select("owner_user_id")
        .eq("id", booking.provider_id)
        .maybeSingle();
      if (providerRow?.owner_user_id === user.id) {
        isProviderSide = true;
      } else {
        const { data: staffRows } = await admin
          .from("provider_staff")
          .select("id")
          .eq("provider_id", booking.provider_id)
          .eq("user_id", user.id)
          .limit(1);
        if (Array.isArray(staffRows) && staffRows.length > 0) {
          isProviderSide = true;
        }
      }
    }

    if (!isCustomer && !isSuperadmin && !isProviderSide) {
      return errorResponse("Forbidden", "FORBIDDEN", 403);
    }

    const ttlSeconds = 5 * 60;
    const token = mintReceiptDownloadToken({
      kind: "customer_booking_receipt",
      subjectId: id,
      userId: user.id,
      ttlSeconds,
    });

    const origin = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
    if (!origin) {
      return errorResponse(
        "NEXT_PUBLIC_APP_URL is not configured",
        "CONFIG_ERROR",
        500,
      );
    }

    const url = `${origin}/api/bookings/${encodeURIComponent(id)}/receipt/pdf?token=${encodeURIComponent(token)}`;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

    return successResponse({ url, expires_at: expiresAt });
  } catch (error) {
    return handleApiError(error, "Failed to mint receipt download URL");
  }
}
