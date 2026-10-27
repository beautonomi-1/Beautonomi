import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
  getPaginationParams,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { z } from "zod";
import { insertWithInvoiceNumber } from "@/lib/invoices/insert-with-invoice-number";
import {
  applyInvoiceStatusFilter,
  computeInvoiceSummary,
  todayUtcYmd,
  withEffectiveStatus,
} from "@/lib/invoices/provider-invoices-query";

const invoiceLineItemSchema = z.object({
  id: z.string().uuid().optional(),
  line_item_type: z.enum(["platform_fee", "commission", "subscription", "transaction_fee", "adjustment", "other"]).optional().default("other"),
  description: z.string().min(1),
  quantity: z.coerce.number().nonnegative().default(1),
  unit_price: z.coerce.number().nonnegative(),
});

const createInvoiceSchema = z.object({
  /** Which provider is being billed. Required now that only staff may raise invoices. */
  provider_id: z.string().uuid(),
  invoice_type: z.enum(["platform_fee", "commission", "subscription", "transaction_fee", "other"]).optional().default("other"),
  period_start: z.string().min(1),
  period_end: z.string().min(1),
  issue_date: z.string().min(1),
  due_date: z.string().min(1),
  tax_rate: z.coerce.number().min(0).max(100).optional().default(0),
  status: z.enum(["draft", "sent"]).optional().default("draft"),
  description: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  line_items: z.array(invoiceLineItemSchema).min(1),
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

function currentYear() {
  return new Date().getUTCFullYear();
}
/**
 * GET /api/provider/invoices
 * Get list of invoices for the provider
 */
export async function GET(request: NextRequest) {
  try {
    const permissionCheck = await requirePermission("manage_finance", request);
    if (!permissionCheck.authorized) return permissionCheck.response!;
    const { user } = permissionCheck;
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

    const { page, limit, offset } = getPaginationParams(request);
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status");
    const invoiceType = searchParams.get("type");
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");
    const q = searchParams.get("q")?.trim();
    const today = todayUtcYmd();

    let query = supabase
      .from("provider_invoices")
      .select(
        `
        *,
        payment_methods:provider_payment_methods(id, name, type, last4),
        line_items:provider_invoice_line_items(*),
        payments:provider_invoice_payments(*)
      `,
        { count: "exact" }
      )
      .eq("provider_id", providerId);
    query = applyInvoiceStatusFilter(query, status, today);
    if (q) {
      query = query.or(`invoice_number.ilike.%${q}%,description.ilike.%${q}%`);
    }
    if (invoiceType) {
      query = query.eq("invoice_type", invoiceType);
    }
    if (dateFrom) {
      query = query.gte("issue_date", dateFrom);
    }
    if (dateTo) {
      query = query.lte("issue_date", dateTo);
    }
    query = query
      .order("issue_date", { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: invoices, error, count } = await query;

    if (error) {
      throw error;
    }

    let summaryQuery = supabase
      .from("provider_invoices")
      .select("status, due_date, total_amount, amount_paid, amount_due")
      .eq("provider_id", providerId);
    if (invoiceType) {
      summaryQuery = summaryQuery.eq("invoice_type", invoiceType);
    }
    if (dateFrom) {
      summaryQuery = summaryQuery.gte("issue_date", dateFrom);
    }
    if (dateTo) {
      summaryQuery = summaryQuery.lte("issue_date", dateTo);
    }
    const { data: summaryRows } = await summaryQuery;

    const summary = computeInvoiceSummary(summaryRows ?? [], today);
    const enriched = (invoices ?? []).map((inv) => withEffectiveStatus(inv as Record<string, unknown>, today));

    return successResponse({
      invoices: enriched,
      total: count || 0,
      page,
      limit,
      total_pages: Math.ceil((count || 0) / limit),
      summary,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch invoices");
  }
}

/**
 * POST /api/provider/invoices
 *
 * Raise a platform invoice against a provider. These are invoices Beautonomi
 * issues TO the provider, so only staff may author them — providers view, download
 * and pay. Automated issuance goes through `/api/provider/invoices/generate`.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["superadmin"], request);

    const validated = createInvoiceSchema.parse(await request.json());
    const providerId = validated.provider_id;
    if (!providerId) {
      return handleApiError(
        new Error("provider_id is required"),
        "provider_id is required",
        "VALIDATION_ERROR",
        400,
      );
    }
    const admin = getSupabaseAdmin();
    const { data: providerRow } = await admin
      .from("providers")
      .select("currency")
      .eq("id", providerId)
      .maybeSingle();
    const currency =
      (providerRow as { currency?: string | null } | null)?.currency ?? "ZAR";

    const { normalizedItems, subtotal, taxAmount, totalAmount } = calculateInvoiceTotals(
      validated.line_items,
      validated.tax_rate,
    );
    const year = currentYear();

    const invoice = await insertWithInvoiceNumber(admin, year, {
      provider_id: providerId,
      generated_by: "admin",
      invoice_type: validated.invoice_type,
      period_start: validated.period_start,
      period_end: validated.period_end,
      issue_date: validated.issue_date,
      due_date: validated.due_date,
      subtotal,
      tax_rate: validated.tax_rate,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      currency,
      status: validated.status,
      description: validated.description ?? null,
      notes: validated.notes ?? null,
      line_items: normalizedItems,
      created_by: user.id,
      sent_at: validated.status === "sent" ? new Date().toISOString() : null,
    });

    if (normalizedItems.length) {
      const { error: lineItemError } = await admin.from("provider_invoice_line_items").insert(
        normalizedItems.map((item) => ({
          invoice_id: invoice.id,
          ...item,
        })),
      );
      if (lineItemError) {
        await admin.from("provider_invoices").delete().eq("id", invoice.id as string);
        throw lineItemError;
      }
    }

    const { data: created } = await admin
      .from("provider_invoices")
      .select("*, payment_methods:provider_payment_methods(id, name, type, last4), line_items:provider_invoice_line_items(*), payments:provider_invoice_payments(*)")
      .eq("id", invoice.id as string)
      .single();

    return successResponse(created ?? invoice);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(error, "Invalid invoice data", "VALIDATION_ERROR", 400);
    }
    return handleApiError(error, "Failed to create invoice");
  }
}
