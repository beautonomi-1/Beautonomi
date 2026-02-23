import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";

/**
 * PATCH /api/admin/invoices/[id]
 * Update invoice (e.g. mark as sent) — superadmin only.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const body = await request.json();
    const { status, notes } = body;

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (status) {
      updates.status = status;
      if (status === "sent") {
        updates.sent_at = new Date().toISOString();
      }
    }
    if (notes !== undefined) {
      updates.notes = notes;
    }

    const { data: invoice, error } = await supabase
      .from("provider_invoices")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      throw error;
    }
    if (!invoice) {
      return notFoundResponse("Invoice not found");
    }

    return successResponse(invoice);
  } catch (error) {
    return handleApiError(error, "Failed to update invoice");
  }
}
