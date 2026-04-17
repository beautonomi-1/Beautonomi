/**
 * POST /api/provider/bookings/[id]/receipt/signed-url
 *
 * §Provider-launch (audit 2026-04): mints a 5-minute HMAC-signed URL that
 * the native provider app can open in a system PDF viewer without sending
 * a `Bearer` token. The signed token carries the booking id + the provider
 * user id + an expiry. The PDF route validates the token on its end.
 *
 * Requires the caller to be a provider / staff with access to the booking
 * (same auth rules as the underlying receipt JSON route). On success
 * returns `{ url, expires_at }`.
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
      ["provider_owner", "provider_staff", "superadmin"],
      request,
    );
    const { id } = await params;
    if (!id) return errorResponse("Booking id is required", "VALIDATION_ERROR", 400);

    // Confirm the booking exists and belongs to a provider the caller can
    // see. Re-use the sibling receipt JSON route to apply identical access
    // rules instead of duplicating them here.
    const admin = getSupabaseAdmin();
    const { data: booking } = await admin
      .from("bookings")
      .select("id, provider_id")
      .eq("id", id)
      .maybeSingle();

    if (!booking) {
      return errorResponse("Booking not found", "NOT_FOUND", 404);
    }

    // Delegate the full "can this user access this booking" decision to a
    // lightweight access check: provider owner, their active staff, or
    // superadmin. Mirrors the logic enforced by /receipt/route.ts.
    const { data: accessRows } = await admin
      .from("provider_staff")
      .select("id")
      .eq("provider_id", booking.provider_id)
      .eq("user_id", user.id)
      .limit(1);
    const { data: providerRow } = await admin
      .from("providers")
      .select("owner_user_id")
      .eq("id", booking.provider_id)
      .maybeSingle();

    const isOwner = providerRow?.owner_user_id === user.id;
    const isStaff = Array.isArray(accessRows) && accessRows.length > 0;
    const isSuperadmin = (user as { role?: string }).role === "superadmin";
    if (!isOwner && !isStaff && !isSuperadmin) {
      return errorResponse("Forbidden", "FORBIDDEN", 403);
    }

    const ttlSeconds = 5 * 60;
    const token = mintReceiptDownloadToken({
      kind: "provider_booking_receipt",
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
    const url = `${origin}/api/provider/bookings/${encodeURIComponent(id)}/receipt/pdf?token=${encodeURIComponent(token)}`;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

    return successResponse({ url, expires_at: expiresAt });
  } catch (error) {
    return handleApiError(error, "Failed to mint receipt download URL");
  }
}
