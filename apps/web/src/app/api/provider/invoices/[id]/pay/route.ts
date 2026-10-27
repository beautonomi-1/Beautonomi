import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  successResponse,
  handleApiError,
  forbiddenResponse,
  userHasProviderAccessAdmin,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { invoiceAmountDue } from "@/lib/invoices/provider-invoice-status";

/**
 * POST /api/provider/invoices/[id]/pay
 * Submit an off-platform payment claim (EFT, bank transfer). Creates a pending
 * row for superadmin confirmation — it does not settle the invoice.
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
      .select("id, provider_id, total_amount, amount_paid, amount_due, status")
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

    const inv = invoice as {
      provider_id?: string | null;
      status?: string | null;
    };
    const invPid = inv.provider_id;
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

    if (inv.status === "cancelled" || inv.status === "refunded" || inv.status === "paid") {
      return handleApiError(
        new Error("Invoice cannot accept a payment claim in this status"),
        "Invoice cannot accept a payment claim in this status",
        "VALIDATION_ERROR",
        400,
      );
    }

    const due = invoiceAmountDue(invoice as Parameters<typeof invoiceAmountDue>[0]);
    const claimAmount = Number(amount);
    if (claimAmount > due + 0.005) {
      return handleApiError(
        new Error(`Payment amount cannot exceed ${due.toFixed(2)}`),
        `Payment amount cannot exceed ${due.toFixed(2)}`,
        "VALIDATION_ERROR",
        400,
      );
    }

    const { data: existingPending } = await admin
      .from("provider_invoice_payments")
      .select("id")
      .eq("invoice_id", id)
      .eq("status", "pending")
      .maybeSingle();

    if (existingPending) {
      return handleApiError(
        new Error("A payment claim is already pending confirmation for this invoice"),
        "A payment claim is already pending confirmation for this invoice",
        "VALIDATION_ERROR",
        409,
      );
    }

    const { error: insertError } = await admin.from("provider_invoice_payments").insert({
      invoice_id: id,
      payment_method_id: paymentMethodId || null,
      amount: claimAmount,
      payment_date: paymentDate || new Date().toISOString().split("T")[0],
      payment_reference: paymentReference?.trim() || null,
      status: "pending",
      created_by: permissionCheck.user!.id,
      metadata: { source: "provider_eft_claim" },
    });

    if (insertError) {
      if ((insertError as { code?: string }).code === "23505") {
        return handleApiError(
          new Error("A payment claim is already pending confirmation for this invoice"),
          "A payment claim is already pending confirmation for this invoice",
          "VALIDATION_ERROR",
          409,
        );
      }
      throw insertError;
    }

    const { data: updatedInvoice } = await admin
      .from("provider_invoices")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    return successResponse({
      pending: true,
      amount_claimed: claimAmount,
      invoice: updatedInvoice,
    });
  } catch (error) {
    return handleApiError(error, "Failed to submit payment claim");
  }
}
