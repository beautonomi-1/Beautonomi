import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { serializeWalletBankRefundRequest } from "@/lib/wallet-bank-refunds/serialize";
import { notifyWalletBankRefund } from "@/lib/wallet-bank-refunds/notify";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireRoleInApi(["customer", "provider_owner", "provider_staff", "superadmin"], request);
    const { id } = await params;
    const admin = getSupabaseAdmin();

    const { data, error } = await admin.rpc("wallet_bank_refund_cancel", {
      p_request_id: id,
      p_user_id: user.id,
    });
    if (error) {
      const msg = error.message || "";
      if (msg.includes("REQUEST_NOT_FOUND")) {
        return errorResponse("Request not found", "NOT_FOUND", 404);
      }
      if (msg.includes("ONLY_PENDING_CAN_BE_CANCELLED")) {
        return errorResponse(
          "This request has already been approved and can no longer be cancelled.",
          "INVALID_STATE",
          400,
        );
      }
      throw error;
    }

    const row = (data as { request?: Record<string, unknown> })?.request;
    if (row) await notifyWalletBankRefund("cancelled", row as never);
    return successResponse({ request: row ? serializeWalletBankRefundRequest(row) : null });
  } catch (error) {
    return handleApiError(error, "Failed to cancel wallet bank refund request");
  }
}
