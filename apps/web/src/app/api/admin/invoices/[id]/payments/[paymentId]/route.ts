import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireSuperadmin,
  successResponse,
  handleApiError,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";

const bodySchema = z.object({
  action: z.enum(["confirm", "refund"]),
});

/**
 * PATCH /api/admin/invoices/[id]/payments/[paymentId]
 * Superadmin confirms a pending EFT claim or refunds a completed payment.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; paymentId: string }> },
) {
  try {
    await requireSuperadmin(request);
    const { id: invoiceId, paymentId } = await params;
    const { action } = bodySchema.parse(await request.json());
    const admin = getSupabaseAdmin();

    const { data: payment, error: loadErr } = await admin
      .from("provider_invoice_payments")
      .select("id, invoice_id, amount, status, payment_reference")
      .eq("id", paymentId)
      .eq("invoice_id", invoiceId)
      .maybeSingle();

    if (loadErr || !payment) {
      return notFoundResponse("Payment not found");
    }

    const row = payment as { status?: string; amount?: number };

    if (action === "confirm") {
      if (row.status === "completed") {
        return successResponse({ payment, already_confirmed: true });
      }
      if (row.status !== "pending") {
        return handleApiError(
          new Error("Only pending payments can be confirmed"),
          "Only pending payments can be confirmed",
          "VALIDATION_ERROR",
          400,
        );
      }

      const { data: updated, error: updateErr } = await admin
        .from("provider_invoice_payments")
        .update({ status: "completed", updated_at: new Date().toISOString() })
        .eq("id", paymentId)
        .eq("status", "pending")
        .select()
        .maybeSingle();

      if (updateErr) throw updateErr;
      if (!updated) {
        return successResponse({ payment, already_confirmed: true });
      }

      const { data: invoice } = await admin
        .from("provider_invoices")
        .select("id, provider_id, status, invoice_number, total_amount")
        .eq("id", invoiceId)
        .maybeSingle();

      if ((invoice as { status?: string } | null)?.status === "paid") {
        const providerId = (invoice as { provider_id?: string }).provider_id;
        if (providerId) {
          const { notifyProviderInvoicePaid } = await import(
            "@/lib/notifications/notification-service"
          );
          await notifyProviderInvoicePaid(providerId, {
            invoice_number: String((invoice as { invoice_number?: string }).invoice_number ?? ""),
            total_amount: Number((invoice as { total_amount?: number }).total_amount ?? 0),
            payment_date: new Date().toISOString().split("T")[0],
          });
        }
      }

      return successResponse({ payment: updated });
    }

    if (row.status !== "completed") {
      return handleApiError(
        new Error("Only completed payments can be refunded"),
        "Only completed payments can be refunded",
        "VALIDATION_ERROR",
        400,
      );
    }

    const { data: refunded, error: refundErr } = await admin
      .from("provider_invoice_payments")
      .update({ status: "refunded", updated_at: new Date().toISOString() })
      .eq("id", paymentId)
      .eq("status", "completed")
      .select()
      .maybeSingle();

    if (refundErr) throw refundErr;

    return successResponse({ payment: refunded });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(error, "Invalid request", "VALIDATION_ERROR", 400);
    }
    return handleApiError(error, "Failed to update payment");
  }
}
