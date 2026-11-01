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
 * Superadmin refunds a completed payment. Bank-transfer confirm is disabled —
 * providers pay via card checkout only (migration 1025 fails pending claims).
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
      return handleApiError(
        new Error(
          "Bank transfer confirmation is no longer supported. Providers pay invoices online via card checkout.",
        ),
        "Bank transfer confirmation is no longer supported. Providers pay invoices online via card checkout.",
        "VALIDATION_ERROR",
        400,
      );
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
