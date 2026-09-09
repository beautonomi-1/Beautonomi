import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  forbiddenResponse,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { notifyProviderInvoiceIssued } from "@/lib/notifications/notification-service";

/**
 * POST /api/provider/invoices/[id]/send
 *
 * Issue a draft platform invoice to the provider: flips the status to `sent` and
 * notifies them (push + email). Staff-only — providers receive these invoices,
 * they do not issue them.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const { id } = await params;
    const admin = getSupabaseAdmin();

    const { data: existing, error: loadErr } = await admin
      .from("provider_invoices")
      .select("id, provider_id, status, invoice_number, total_amount, due_date, period_start, period_end")
      .eq("id", id)
      .maybeSingle();

    if (loadErr || !existing) {
      return handleApiError(new Error("Invoice not found"), "Invoice not found", "NOT_FOUND", 404);
    }

    const inv = existing as {
      provider_id?: string | null;
      status?: string | null;
      invoice_number?: string | null;
      total_amount?: number | null;
      due_date?: string | null;
      period_start?: string | null;
      period_end?: string | null;
    };
    const invPid = inv.provider_id;
    if (!invPid) {
      return forbiddenResponse("Invalid invoice record");
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

    // Delivery failure must not roll back issuance — the invoice is legitimately
    // sent and visible in the app; the provider just missed the nudge.
    let notified = true;
    try {
      const result = await notifyProviderInvoiceIssued(invPid, {
        invoice_number: inv.invoice_number ?? id,
        total_amount: Number(inv.total_amount ?? 0),
        due_date: inv.due_date ?? "",
        period_start: inv.period_start,
        period_end: inv.period_end,
      });
      notified = result.success !== false;
    } catch (notifyError) {
      notified = false;
      console.error("[invoices/send] notification failed", {
        invoiceId: id,
        error: notifyError instanceof Error ? notifyError.message : String(notifyError),
      });
    }

    return successResponse({ ...(invoice as Record<string, unknown>), notified });
  } catch (error) {
    return handleApiError(error, "Failed to send invoice");
  }
}
