import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  forbiddenResponse,
  errorResponse,
  userHasProviderAccessAdmin,
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
    const { id } = await params;
    const admin = getSupabaseAdmin();

    const { data: existing, error: loadErr } = await admin
      .from("provider_invoices")
      .select("id, provider_id, status")
      .eq("id", id)
      .maybeSingle();

    if (loadErr || !existing) {
      return handleApiError(new Error("Invoice not found"), "Invoice not found", "NOT_FOUND", 404);
    }

    const inv = existing as { provider_id?: string | null; status?: string | null };
    const invPid = inv.provider_id;
    if (!invPid) {
      return forbiddenResponse("Invalid invoice record");
    }
    if (!(await userHasProviderAccessAdmin(admin, user.id, invPid))) {
      return forbiddenResponse("You do not have access to this invoice");
    }

    if (inv.status === "sent") {
      const { data: invoice } = await admin
        .from("provider_invoices")
        .select()
        .eq("id", id)
        .eq("provider_id", invPid)
        .single();
      return successResponse(invoice);
    }

    if (inv.status !== "draft") {
      return errorResponse(
        "Only draft invoices can be marked as sent",
        "INVALID_STATUS",
        409
      );
    }

    const { data: invoice, error } = await admin
      .from("provider_invoices")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("provider_id", invPid)
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
