import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  successResponse,
  handleApiError,
  forbiddenResponse,
  userHasProviderAccessAdmin,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { recordProviderInvoicePayment } from "@/lib/invoices/record-provider-invoice-payment";

/**
 * POST /api/provider/invoices/[id]/pay
 * Record a payment made outside the platform (EFT, cash, card machine) against
 * an invoice. Online card payment goes through `/initialize-payment` instead.
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
      .select("id, provider_id")
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

    // Amount validation, idempotency and the amount_paid/status trigger all live
    // in the shared recorder so offline and gateway payments cannot diverge.
    const result = await recordProviderInvoicePayment({
      supabase: admin,
      invoiceId: id,
      amount: Number(amount),
      paymentMethodId: paymentMethodId || null,
      paymentDate: paymentDate || null,
      paymentReference: paymentReference || null,
      createdBy: permissionCheck.user!.id,
      metadata: { source: "provider_manual" },
    });

    const { data: updatedInvoice } = await admin
      .from("provider_invoices")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    return successResponse({
      applied: result.applied,
      amount_applied: result.amountApplied,
      invoice: updatedInvoice,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/cannot exceed|greater than 0/i.test(message)) {
      return handleApiError(error, message, "VALIDATION_ERROR", 400);
    }
    if (/Invoice not found/i.test(message)) {
      return handleApiError(error, message, "NOT_FOUND", 404);
    }
    return handleApiError(error, "Failed to record payment");
  }
}
