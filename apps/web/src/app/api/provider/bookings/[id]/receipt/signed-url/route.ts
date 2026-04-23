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
    // §Provider-launch (audit 2026-04): previously gated by requireRoleInApi
    // with a fixed role list which 403'd any provider whose public.users.role
    // hadn't been upgraded yet (common race with /api/me/role). Access here
    // is an ownership question — authenticate, then check the booking row.
    const { user: authUser } = await requireAuthInApi(request);
    const { id } = await params;
    if (!id) return errorResponse("Booking id is required", "VALIDATION_ERROR", 400);

    const admin = getSupabaseAdmin();
    const { data: booking } = await admin
      .from("bookings")
      .select("id, provider_id")
      .eq("id", id)
      .maybeSingle();

    if (!booking) {
      return errorResponse("Booking not found", "NOT_FOUND", 404);
    }

    const { data: userRow } = await admin
      .from("users")
      .select("id, role")
      .eq("id", authUser.id)
      .maybeSingle();
    const isSuperadmin = userRow?.role === "superadmin";

    // §Multi-provider staff 2026-04: use the same admin-backed access check
    // as GET /receipt (see userHasProviderAccessAdmin). Previously this
    // route compared `providers.owner_user_id`, which is not the schema
    // column (`user_id`), so salon owners always failed the owner check and
    // relied only on provider_staff — breaking receipt links for owners
    // without a staff row.
    const bookingPid = booking.provider_id as string;
    if (
      !isSuperadmin &&
      !(await userHasProviderAccessAdmin(admin, authUser.id, bookingPid))
    ) {
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
      kind: "provider_booking_receipt",
      subjectId: id,
      userId: authUser.id,
      ttlSeconds,
    });
    const url = `${origin}/api/provider/bookings/${encodeURIComponent(id)}/receipt/pdf?token=${encodeURIComponent(token)}`;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

    return successResponse({ url, expires_at: expiresAt });
  } catch (error) {
    return handleApiError(error, "Failed to mint receipt download URL");
  }
}
