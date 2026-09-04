import { NextRequest } from "next/server";
import {
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { requireAnyPermission } from "@/lib/auth/requirePermission";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getProviderReportContext } from "@/lib/reports/provider-report-utils";
import {
  buildProviderTransactionsFeed,
  PROVIDER_TRANSACTIONS_MAX_LIST_LIMIT,
} from "@/lib/provider/provider-transactions-feed";
import type { ProviderTxnUiType } from "@/lib/provider/provider-ledger-transaction-view";

export const maxDuration = 60;

const VALID_TYPE_FILTERS = new Set<string>([
  "all",
  "earning",
  "fee",
  "payout",
  "refund",
  "tip",
  "adjustment",
]);

function parseTypeFilter(raw: string | null): ProviderTxnUiType | "all" {
  if (raw && VALID_TYPE_FILTERS.has(raw) && raw !== "all") {
    return raw as ProviderTxnUiType;
  }
  return "all";
}

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
    const limit = Math.min(parseInt(sp.get("limit") || "50", 10), PROVIDER_TRANSACTIONS_MAX_LIST_LIMIT);
    const listOffset = Math.max(parseInt(sp.get("offset") || "0", 10) || 0, 0);
    const locationId = sp.get("location_id") || null;
    const typeFilter = parseTypeFilter(sp.get("type"));

    const payload = await buildProviderTransactionsFeed({
      db: supabaseAdmin,
      providerId,
      timezone: reportContext.timezone,
      period,
      limit,
      listOffset,
      locationId,
      typeFilter,
    });

    return successResponse(payload);
  } catch (error) {
    console.error("Error fetching transactions:", error);
    return handleApiError(error, "Failed to load transactions");
  }
}
