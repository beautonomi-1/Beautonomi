import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, handleApiError, errorResponse  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { checkAdminExportRateLimit } from "@/lib/rate-limit/admin-export";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import {
  fetchFinanceLedgerExportRowsForTenant,
  financeTransactionTypesForAdminFilter,
} from "@/lib/admin/finance-ledger-tenant";

/**
 * GET /api/admin/export/finance
 * 
 * Export financial data to CSV (rate limited)
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const { allowed, retryAfter } = await checkAdminExportRateLimit(user.id, "export:finance");
    if (!allowed) {
      return errorResponse(
        `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
        "RATE_LIMIT_EXCEEDED",
        429
      );
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return errorResponse("Database unavailable", "SERVER_ERROR", 500);
    }
    const tenantId = await resolveAdminApiTenantId(request);

    const { searchParams } = new URL(request.url);
    const transactionType = searchParams.get("transaction_type");
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");
    const providerIdFilter = searchParams.get("provider_id");
    const now = new Date();
    const defaultStart = new Date();
    defaultStart.setUTCDate(1);
    defaultStart.setUTCHours(0, 0, 0, 0);
    const rangeStart = startDate || defaultStart.toISOString();
    const rangeEnd = endDate || now.toISOString();
    const transactionTypes = financeTransactionTypesForAdminFilter(transactionType);
    const restrictProviderIds = providerIdFilter ? [providerIdFilter] : undefined;

    let transactions: Awaited<ReturnType<typeof fetchFinanceLedgerExportRowsForTenant>>;
    try {
      transactions = await fetchFinanceLedgerExportRowsForTenant(
        supabase,
        tenantId,
        { start: rangeStart, end: rangeEnd },
        transactionTypes
          ? { transactionTypes, restrictProviderIds }
          : {
              transactionType:
                transactionType && transactionType !== "all" ? transactionType : null,
              restrictProviderIds,
            }
      );
    } catch (err) {
      return handleApiError(err, "Failed to fetch financial data");
    }

    // Convert to CSV
    const headers = [
      "ID",
      "Transaction Type",
      "Amount",
      "Net",
      "Fees",
      "Currency",
      "Status",
      "Booking ID",
      "Product Order ID",
      "Booking Number",
      "Provider ID",
      "Customer ID",
      "Created At",
      "Metadata",
    ];

    type TxRow = { id: string; transaction_type?: string; amount?: number; net?: number; fees?: number; currency?: string; status?: string; booking_id?: string; product_order_id?: string; booking?: { booking_number?: string; provider_id?: string; customer_id?: string }; provider_id?: string; created_at?: string; metadata?: unknown };
    const rows = (transactions || []).map((transaction: TxRow) => [
      transaction.id,
      transaction.transaction_type,
      transaction.amount,
      transaction.net,
      transaction.fees || 0,
      transaction.currency,
      transaction.status,
      transaction.booking_id || "",
      transaction.product_order_id || "",
      transaction.booking?.booking_number || "",
      transaction.booking?.provider_id || transaction.provider_id || "",
      transaction.booking?.customer_id || "",
      transaction.created_at,
      JSON.stringify(transaction.metadata || {}),
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");

    return new Response(csvContent, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="finance-export-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to export financial data");
  }
}
