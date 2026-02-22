import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
} from "@/lib/supabase/api-helpers";

/**
 * POST /api/provider/invoices/[id]/send
 * Mark invoice as sent (aligns with provider mobile app and portal).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    if (!supabase) throw new Error("Supabase not available");
    const providerId = await getProviderIdForUser(user.id, supabase);
    const { id } = await params;

    if (!providerId) {
      return handleApiError(new Error("Provider not found"), "Provider not found", "NOT_FOUND", 404);
    }

    const { data: invoice, error } = await supabase
      .from("provider_invoices")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("provider_id", providerId)
      .select()
      .single();

    if (error) throw error;
    if (!invoice) {
      return handleApiError(new Error("Invoice not found"), "Invoice not found", "NOT_FOUND", 404);
    }

    return successResponse(invoice);
  } catch (error) {
    return handleApiError(error, "Failed to send invoice");
  }
}
