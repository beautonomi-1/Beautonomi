import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";

/**
 * GET /api/admin/providers/[id]/payout-accounts
 *
 * List a provider's payout accounts (bank accounts).
 * Superadmin only. Used when viewing provider details in admin.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleInApi(["superadmin"]);
    const supabase = await getSupabaseServer();
    const { id: providerId } = await params;

    if (!providerId) {
      return notFoundResponse("Provider ID required");
    }

    const { data: accounts, error } = await supabase
      .from("provider_payout_accounts")
      .select("*")
      .eq("provider_id", providerId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return successResponse(accounts || []);
  } catch (error) {
    return handleApiError(error, "Failed to fetch payout accounts");
  }
}
