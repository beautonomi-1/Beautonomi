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
    if (!id) return errorResponse("Group booking id is required", "VALIDATION_ERROR", 400);

    const admin = getSupabaseAdmin();
    const { data: group } = await admin
      .from("group_bookings")
      .select("id, provider_id")
      .eq("id", id)
      .maybeSingle();
    if (!group) return errorResponse("Group booking not found", "NOT_FOUND", 404);

    const { data: userRow } = await admin
      .from("users")
      .select("id, role")
      .eq("id", authUser.id)
      .maybeSingle();
    const isSuperadmin = userRow?.role === "superadmin";
    if (
      !isSuperadmin &&
      !(await userHasProviderAccessAdmin(admin, authUser.id, group.provider_id as string))
    ) {
      return errorResponse(
        "You don't have access to this group booking receipt.",
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
      kind: "provider_group_booking_receipt",
      subjectId: id,
      userId: authUser.id,
      ttlSeconds,
    });
    const url = `${origin}/api/provider/group-bookings/${encodeURIComponent(id)}/receipt/pdf?token=${encodeURIComponent(token)}`;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

    return successResponse({ url, expires_at: expiresAt });
  } catch (error) {
    return handleApiError(error, "Failed to mint group receipt download URL");
  }
}
