import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  successResponse,
  handleApiError,
  forbiddenResponse,
  userHasProviderAccessAdmin,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";

/**
 * POST /api/provider/invoices/[id]/pay
 * Record a payment against an invoice
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const permissionCheck = await requirePermission("edit_settings", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }

    const supabase = await getSupabaseServer(request);
    const admin = getSupabaseAdmin();
    const body = await request.json();
    const { amount, paymentMethodId, paymentDate, paymentReference } = body;

    if (!amount || amount <= 0) {
      return handleApiError(
        new Error("Invalid payment amount"),
        "Payment amount must be greater than 0",
        "VALIDATION_ERROR",
        400
      );
    }

    const { data: invoice, error: invoiceError } = await admin
      .from("provider_invoices")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (invoiceError || !invoice) {
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
    if (
      !(await userHasProviderAccessAdmin(
        admin,
        permissionCheck.user!.id,
        invPid,
      ))
    ) {
      return forbiddenResponse("You do not have access to this invoice");
    }

    // Check if payment amount exceeds amount due
    const amountDue = invoice.total_amount - (invoice.amount_paid || 0);
    if (amount > amountDue) {
      return handleApiError(
        new Error("Payment amount exceeds amount due"),
        `Payment amount cannot exceed ${amountDue}`,
        "VALIDATION_ERROR",
        400
      );
    }

    // Create payment record
    const { data: payment, error: paymentError } = await supabase
      .from("provider_invoice_payments")
      .insert({
        invoice_id: id,
        payment_method_id: paymentMethodId || null,
        amount,
        payment_date: paymentDate || new Date().toISOString().split("T")[0],
        payment_reference: paymentReference || null,
        status: "completed",
        created_by: permissionCheck.user!.id,
      })
      .select()
      .single();

    if (paymentError) {
      throw paymentError;
    }

    // The trigger will automatically update invoice amount_paid and status

    return successResponse(payment);
  } catch (error) {
    return handleApiError(error, "Failed to record payment");
  }
}
