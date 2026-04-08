import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_USERS_TRUST } from "@/lib/admin-sections";

/**
 * GET /api/admin/users/[id]/wallet-transactions
 *
 * Recent ledger rows for the user's wallet (customer wallet credits/debits).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminSection(ADMIN_SECTION_USERS_TRUST, request);
    const { id: userId } = await params;
    const supabase = getSupabaseAdmin();

    const { data: wallet, error: walletError } = await supabase
      .from("user_wallets")
      .select("id, currency")
      .eq("user_id", userId)
      .maybeSingle();

    if (walletError) {
      throw walletError;
    }

    if (!wallet) {
      return successResponse([]);
    }

    const walletRow = wallet as { id: string; currency?: string };

    const { data: rows, error: txError } = await supabase
      .from("wallet_transactions")
      .select("id, type, amount, description, reference_id, reference_type, created_at")
      .eq("wallet_id", walletRow.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (txError) {
      throw txError;
    }

    return successResponse(rows ?? []);
  } catch (error) {
    return handleApiError(error, "Failed to fetch wallet transactions");
  }
}
