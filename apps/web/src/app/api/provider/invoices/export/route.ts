import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  getProviderIdForUser,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import {
  applyInvoiceStatusFilter,
  exportableInvoiceAmountDue,
  todayUtcYmd,
  withEffectiveStatus,
} from "@/lib/invoices/provider-invoices-query";

function csvEscape(value: unknown): string {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

/**
 * GET /api/provider/invoices/export
 * Quoted CSV for the current invoice filters (not paginated).
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
        404,
      );
    }

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
        "id, invoice_number, invoice_type, issue_date, due_date, currency, total_amount, amount_paid, amount_due, status, description",
      )
      .eq("provider_id", providerId);
    query = applyInvoiceStatusFilter(query, status, today);
    if (q) {
      query = query.or(`invoice_number.ilike.%${q}%,description.ilike.%${q}%`);
    }
    if (invoiceType) query = query.eq("invoice_type", invoiceType);
    if (dateFrom) query = query.gte("issue_date", dateFrom);
    if (dateTo) query = query.lte("issue_date", dateTo);
    query = query.order("issue_date", { ascending: false });

    const { data: rows, error } = await query;
    if (error) throw error;

    const header = [
      "invoice_number",
      "issue_date",
      "due_date",
      "effective_status",
      "currency",
      "total_amount",
      "amount_paid",
      "amount_due",
      "invoice_type",
      "description",
    ];
    const lines = [header.map(csvEscape).join(",")];
    for (const raw of rows ?? []) {
      const inv = withEffectiveStatus(raw as Record<string, unknown>, today);
      const due = exportableInvoiceAmountDue(
        {
          invoice_type: typeof inv.invoice_type === "string" ? inv.invoice_type : null,
          status: typeof inv.status === "string" ? inv.status : null,
          due_date: typeof inv.due_date === "string" ? inv.due_date : null,
          total_amount: Number(inv.total_amount ?? 0),
          amount_paid: Number(inv.amount_paid ?? 0),
          amount_due: Number(inv.amount_due ?? NaN),
          effective_status:
            typeof inv.effective_status === "string" ? inv.effective_status : null,
        },
        today,
      );
      lines.push(
        [
          inv.invoice_number,
          inv.issue_date,
          inv.due_date,
          inv.effective_status ?? inv.status,
          inv.currency,
          inv.total_amount,
          inv.amount_paid,
          due,
          inv.invoice_type,
          inv.description,
        ]
          .map(csvEscape)
          .join(","),
      );
    }

    return new Response(lines.join("\n"), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="provider-invoices.csv"`,
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to export invoices");
  }
}
