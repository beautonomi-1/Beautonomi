import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { serializeWalletBankRefundRequest } from "@/lib/wallet-bank-refunds/serialize";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireRoleInApi(["customer", "provider_owner", "provider_staff", "superadmin"], request);
    const { id } = await params;
    const admin = getSupabaseAdmin();

    const { data: row, error } = await admin
      .from("wallet_bank_refund_requests")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    if (!row) return notFoundResponse("Request not found");

    return successResponse(serializeWalletBankRefundRequest(row as Record<string, unknown>));
  } catch (error) {
    return handleApiError(error, "Failed to fetch wallet bank refund request");
  }
}
