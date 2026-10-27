import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireSuperadmin,
  successResponse,
  handleApiError,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";

const BLOCKED_STATUSES = new Set(["paid", "partially_paid", "refunded"]);

/**
 * PATCH /api/admin/invoices/[id]
 * Update invoice metadata — superadmin only. Settlement is via payment rows.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireSuperadmin(request);
    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const body = await request.json();
    const { status, notes } = body;

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (status) {
      if (BLOCKED_STATUSES.has(String(status))) {
        return handleApiError(
          new Error("Settlement status is derived from payments"),
          "Settlement status is derived from payments",
          "VALIDATION_ERROR",
          400,
        );
      }
      if (status === "cancelled") {
        const { data: pays } = await supabase
          .from("provider_invoice_payments")
          .select("amount")
          .eq("invoice_id", id)
          .eq("status", "completed");
        const sum = (pays ?? []).reduce((s, p) => s + Number((p as { amount?: number }).amount ?? 0), 0);
        if (sum > 0) {
          return handleApiError(
            new Error("Cannot cancel an invoice with completed payments"),
            "Cannot cancel an invoice with completed payments",
            "VALIDATION_ERROR",
            400,
          );
        }
      }
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
