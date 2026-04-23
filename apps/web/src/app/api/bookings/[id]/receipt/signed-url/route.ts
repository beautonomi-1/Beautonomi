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
    // §Customer-launch (audit 2026-04): previously gated by requireRoleInApi
    // with a fixed role list, which 403'd users whose public.users.role was
    // stale/missing/not in the list (e.g. legacy `customer` rows still on
    // `provider_onboarding`). Access here is an ownership question, not a
    // role question — authenticate the caller, then check the booking row.
    const { user: authUser } = await requireAuthInApi(request);
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

    const { data: userRow } = await admin
      .from("users")
      .select("id, email, phone, role")
      .eq("id", authUser.id)
      .maybeSingle();

    const isSuperadmin = userRow?.role === "superadmin";
    let isCustomer = booking.customer_id === authUser.id;

    // Legacy guest→account linkage: if the booking's customer row still points
    // at a guest placeholder with matching email/phone, treat the signed-in
    // user as the owner and self-heal the link so future loads are O(1).
    if (!isCustomer && booking.customer_id && (userRow?.email || userRow?.phone)) {
      const { data: bookingCustomer } = await admin
        .from("users")
        .select("id, email, phone")
        .eq("id", booking.customer_id)
        .maybeSingle();
      const emailMatches =
        !!userRow?.email && !!bookingCustomer?.email &&
        userRow.email.toLowerCase() === bookingCustomer.email.toLowerCase();
      const phoneMatches =
        !!userRow?.phone && !!bookingCustomer?.phone &&
        userRow.phone === bookingCustomer.phone;
      if (emailMatches || phoneMatches) {
        isCustomer = true;
        await admin
          .from("bookings")
          .update({ customer_id: authUser.id })
          .eq("id", booking.id)
          .eq("customer_id", booking.customer_id);
      }
    }

    let isProviderSide = false;
    if (!isCustomer && !isSuperadmin) {
      const { data: providerRow } = await admin
        .from("providers")
        .select("owner_user_id")
        .eq("id", booking.provider_id)
        .maybeSingle();
      if (providerRow?.owner_user_id === authUser.id) {
        isProviderSide = true;
      } else {
        const { data: staffRows } = await admin
          .from("provider_staff")
          .select("id")
          .eq("provider_id", booking.provider_id)
          .eq("user_id", authUser.id)
          .limit(1);
        if (Array.isArray(staffRows) && staffRows.length > 0) {
          isProviderSide = true;
        }
      }
    }

    if (!isCustomer && !isSuperadmin && !isProviderSide) {
      return errorResponse(
        "You don't have access to this booking's receipt.",
        "FORBIDDEN",
        403,
      );
    }

    if (!hasReceiptDownloadSigningSecret()) {
      console.error(
        "Receipt signed-url: set RECEIPT_DOWNLOAD_TOKEN_SECRET or RETENTION_LINK_SECRET (see apps/web/.env.example).",
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
        "App URL is not configured for receipt links. Set NEXT_PUBLIC_APP_URL (or deploy on Vercel with VERCEL_URL).",
        "CONFIG_ERROR",
        500,
      );
    }

    const ttlSeconds = 5 * 60;
    const token = mintReceiptDownloadToken({
      kind: "customer_booking_receipt",
      subjectId: id,
      userId: authUser.id,
      ttlSeconds,
    });

    const url = `${origin}/api/bookings/${encodeURIComponent(id)}/receipt/pdf?token=${encodeURIComponent(token)}`;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

    return successResponse({ url, expires_at: expiresAt });
  } catch (error) {
    return handleApiError(error, "Failed to mint receipt download URL");
  }
}
