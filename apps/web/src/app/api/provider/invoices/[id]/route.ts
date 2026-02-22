import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";

/**
 * GET /api/provider/invoices/[id]
 * Get a specific invoice
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return handleApiError(
        new Error("Provider not found"),
        "Provider not found",
        "NOT_FOUND",
        404
      );
    }

    const { data: invoice, error } = await supabase
      .from("provider_invoices")
      .select(
        `
        *,
        payment_methods:provider_payment_methods(id, name, type, last4),
        line_items:provider_invoice_line_items(*),
        payments:provider_invoice_payments(*)
      `
      )
      .eq("id", params.id)
      .eq("provider_id", providerId)
      .single();

    if (error) {
      throw error;
    }

    if (!invoice) {
      return handleApiError(
        new Error("Invoice not found"),
        "Invoice not found",
        "NOT_FOUND",
        404
      );
    }

    return successResponse(invoice);
  } catch (error) {
    return handleApiError(error, "Failed to fetch invoice");
  }
}

/**
 * PATCH /api/provider/invoices/[id]
 * Update invoice (mark as sent, paid, etc.)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await getSupabaseServer(request);
    const permissionCheck = await requirePermission("edit_settings", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }

    const { user } = permissionCheck;
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return handleApiError(
        new Error("Provider not found"),
        "Provider not found",
        "NOT_FOUND",
        404
      );
    }
    const body = await request.json();
    const { status, notes } = body;

    const updates: any = {};

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
      .eq("id", params.id)
      .eq("provider_id", providerId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return successResponse(invoice);
  } catch (error) {
    return handleApiError(error, "Failed to update invoice");
  }
}
