import { NextRequest } from "next/server";
import {
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { requireAnyPermission } from "@/lib/auth/requirePermission";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { filterLedgerRowsForLocation, getProviderReportContext } from "@/lib/reports/provider-report-utils";
import {
  mapFinanceLedgerRowToProviderUi,
  providerTransactionsPeriodStart,
  PROVIDER_LEDGER_VISIBLE_TYPES,
  type ProviderLedgerUiRow,
} from "@/lib/provider/provider-ledger-transaction-view";

const LEDGER_PAGE_SIZE = 1000;
const MAX_LEDGER_SCAN = 50_000;

const VISIBLE_TYPES_LIST = Array.from(PROVIDER_LEDGER_VISIBLE_TYPES);

export async function GET(request: NextRequest) {
  try {
    const permissionCheck = await requireAnyPermission(["view_sales", "view_reports", "process_payments"], request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;

    const supabaseAdmin = getSupabaseAdmin();

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");
    const reportContext = await getProviderReportContext(supabaseAdmin, providerId);
    const sp = request.nextUrl.searchParams;
    const period = sp.get("period") || "month";
    const limit = Math.min(parseInt(sp.get("limit") || "50", 10), 200);

    const locationId = sp.get("location_id") || null;
    const fromDate = providerTransactionsPeriodStart(period, reportContext.timezone);

    const mapped: ProviderLedgerUiRow[] = [];
    let offset = 0;

    while (mapped.length < limit && offset < MAX_LEDGER_SCAN) {
      const { data: pageRaw, error: pageError } = await supabaseAdmin
        .from("finance_transactions")
        .select(
          "id, transaction_type, amount, net, created_at, description, booking_id, product_order_id, metadata, refund_component, currency",
        )
        .eq("provider_id", providerId)
        .gte("created_at", fromDate.toISOString())
        .in("transaction_type", VISIBLE_TYPES_LIST)
        .order("created_at", { ascending: false })
        .range(offset, offset + LEDGER_PAGE_SIZE - 1);

      if (pageError) {
        console.error("Error fetching transactions page:", pageError);
        return handleApiError(pageError, "Failed to load transactions");
      }

      const page = pageRaw ?? [];
      if (page.length === 0) break;

      const txns = await filterLedgerRowsForLocation(supabaseAdmin, providerId, page, locationId);

      for (const t of txns) {
        const ui = mapFinanceLedgerRowToProviderUi(t);
        if (ui) {
          mapped.push(ui);
          if (mapped.length >= limit) break;
        }
      }

      if (page.length < LEDGER_PAGE_SIZE) break;
      offset += LEDGER_PAGE_SIZE;
    }

    return successResponse(mapped);
  } catch (error) {
    console.error("Error fetching transactions:", error);
    return handleApiError(error, "Failed to load transactions");
  }
}
