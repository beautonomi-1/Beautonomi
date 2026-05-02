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
import { z } from "zod";

const invoiceLineItemSchema = z.object({
  line_item_type: z.enum(["platform_fee", "commission", "subscription", "transaction_fee", "adjustment", "other"]).optional().default("other"),
  description: z.string().min(1),
  quantity: z.coerce.number().nonnegative().default(1),
  unit_price: z.coerce.number().nonnegative(),
});

const updateInvoiceSchema = z.object({
  invoice_type: z.enum(["platform_fee", "commission", "subscription", "transaction_fee", "other"]).optional(),
  period_start: z.string().min(1).optional(),
  period_end: z.string().min(1).optional(),
  issue_date: z.string().min(1).optional(),
  due_date: z.string().min(1).optional(),
  tax_rate: z.coerce.number().min(0).max(100).optional(),
  status: z.enum(["draft", "sent", "paid", "partially_paid", "overdue", "cancelled", "refunded"]).optional(),
  description: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  line_items: z.array(invoiceLineItemSchema).min(1).optional(),
});

function calculateInvoiceTotals(lineItems: z.infer<typeof invoiceLineItemSchema>[], taxRate: number) {
  const normalizedItems = lineItems.map((item) => {
    const quantity = Number(item.quantity || 0);
    const unitPrice = Number(item.unit_price || 0);
    const totalPrice = Math.round(quantity * unitPrice * 100) / 100;
    return {
      line_item_type: item.line_item_type || "other",
      description: item.description,
      quantity,
      unit_price: unitPrice,
      total_price: totalPrice,
    };
  });
  const subtotal = Math.round(normalizedItems.reduce((sum, item) => sum + item.total_price, 0) * 100) / 100;
  const taxAmount = Math.round(subtotal * (Number(taxRate || 0) / 100) * 100) / 100;
  const totalAmount = Math.round((subtotal + taxAmount) * 100) / 100;
  return { normalizedItems, subtotal, taxAmount, totalAmount };
}

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
      .select("id, provider_id, tax_rate")
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
    const validated = updateInvoiceSchema.parse(body);

    const updates: Record<string, unknown> = {};

    if (validated.status) {
      updates.status = validated.status;
      if (validated.status === "sent") {
        updates.sent_at = new Date().toISOString();
      }
    }

    for (const key of ["invoice_type", "period_start", "period_end", "issue_date", "due_date", "tax_rate", "description", "notes"] as const) {
      if (validated[key] !== undefined) updates[key] = validated[key];
    }

    let normalizedItems: ReturnType<typeof calculateInvoiceTotals>["normalizedItems"] | null = null;
    if (validated.line_items) {
      const taxRate = Number(validated.tax_rate ?? (existing as { tax_rate?: number | null }).tax_rate ?? 0);
      const totals = calculateInvoiceTotals(validated.line_items, taxRate);
      normalizedItems = totals.normalizedItems;
      updates.line_items = totals.normalizedItems;
      updates.subtotal = totals.subtotal;
      updates.tax_rate = taxRate;
      updates.tax_amount = totals.taxAmount;
      updates.total_amount = totals.totalAmount;
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

    if (normalizedItems) {
      const { error: deleteError } = await admin
        .from("provider_invoice_line_items")
        .delete()
        .eq("invoice_id", id);
      if (deleteError) throw deleteError;
      const { error: insertError } = await admin.from("provider_invoice_line_items").insert(
        normalizedItems.map((item) => ({
          invoice_id: id,
          ...item,
        }))
      );
      if (insertError) throw insertError;
    }

    return successResponse(invoice);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(error, "Invalid invoice data", "VALIDATION_ERROR", 400);
    }
    return handleApiError(error, "Failed to update invoice");
  }
}
