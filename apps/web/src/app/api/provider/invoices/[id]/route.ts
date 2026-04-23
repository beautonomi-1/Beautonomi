import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  forbiddenResponse,
  userHasProviderAccessAdmin,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";

/**
 * GET /api/provider/invoices/[id]
 * Get a specific invoice
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const admin = getSupabaseAdmin();

    const { data: invoice, error } = await admin
      .from("provider_invoices")
      .select(
        `
        *,
        payment_methods:provider_payment_methods(id, name, type, last4),
        line_items:provider_invoice_line_items(*),
        payments:provider_invoice_payments(*)
      `
      )
      .eq("id", id)
      .maybeSingle();

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

    const invPid = (invoice as { provider_id?: string | null }).provider_id;
    if (!invPid) {
      return forbiddenResponse("Invalid invoice record");
    }
    if (!(await userHasProviderAccessAdmin(admin, user.id, invPid))) {
      return forbiddenResponse("You do not have access to this invoice");
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const permissionCheck = await requirePermission("edit_settings", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }

    const { user } = permissionCheck;
    const admin = getSupabaseAdmin();

    const { data: existing, error: loadErr } = await admin
      .from("provider_invoices")
      .select("id, provider_id")
      .eq("id", id)
      .maybeSingle();

    if (loadErr || !existing) {
      return handleApiError(
        new Error("Invoice not found"),
        "Invoice not found",
        "NOT_FOUND",
        404
      );
    }

    const invPid = (existing as { provider_id?: string | null }).provider_id;
    if (!invPid) {
      return forbiddenResponse("Invalid invoice record");
    }
    if (!(await userHasProviderAccessAdmin(admin, user.id, invPid))) {
      return forbiddenResponse("You do not have access to this invoice");
    }

    const body = await request.json();
    const { status, notes } = body;

    const updates: Record<string, unknown> = {};

    if (status) {
      updates.status = status;
      if (status === "sent") {
        updates.sent_at = new Date().toISOString();
      }
    }

    if (notes !== undefined) {
      updates.notes = notes;
    }

    const { data: invoice, error } = await admin
      .from("provider_invoices")
      .update(updates)
      .eq("id", id)
      .eq("provider_id", invPid)
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
