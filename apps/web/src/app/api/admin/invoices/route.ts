import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireSuperadmin, successResponse, handleApiError, getPaginationParams  } from "@/lib/supabase/api-helpers";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import {
  applyInvoiceStatusFilter,
  todayUtcYmd,
  withEffectiveStatus,
} from "@/lib/invoices/provider-invoices-query";

/**
 * GET /api/admin/invoices
 * Get list of all invoices (superadmin only)
 */
export async function GET(request: NextRequest) {
  try {
    await requireSuperadmin(request);

    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveAdminApiTenantId(request);
    const { page, limit, offset } = getPaginationParams(request);
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status");
    const providerId = searchParams.get("provider_id");

    let query = supabase
      .from("provider_invoices")
      .select(
        `
        *,
        providers!inner(id, business_name, billing_email, billing_phone, tenant_id),
        payments:provider_invoice_payments(id, amount, status, payment_reference, payment_date, payment_method)
      `,
        { count: "exact" }
      )
      .eq("providers.tenant_id", tenantId)
      .order("issue_date", { ascending: false })
      .range(offset, offset + limit - 1);

    const today = todayUtcYmd();
    query = applyInvoiceStatusFilter(query, status, today);

    if (providerId) {
      query = query.eq("provider_id", providerId);
    }

    const { data: invoices, error, count } = await query;

    if (error) {
      throw error;
    }

    type InvoiceRow = { providers?: { business_name?: string; [key: string]: unknown } | null; [key: string]: unknown };
    const transformedInvoices = (invoices || []).map((invoice: InvoiceRow) => {
      const enriched = withEffectiveStatus(invoice as Record<string, unknown>, today);
      return {
        ...enriched,
        provider: invoice.providers
          ? { ...invoice.providers, name: invoice.providers.business_name }
          : null,
      };
    });

    return successResponse({
      invoices: transformedInvoices,
      total: count || 0,
      page,
      limit,
      total_pages: Math.ceil((count || 0) / limit),
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch invoices");
  }
}
