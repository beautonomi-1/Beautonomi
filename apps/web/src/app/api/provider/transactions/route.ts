import { NextRequest } from "next/server";
import {
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { requireAnyPermission } from "@/lib/auth/requirePermission";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { subDays, subMonths, startOfDay, startOfWeek, startOfMonth } from "date-fns";
import { dateRangeBoundsUtc, formatDateYmd, fromBusinessTime, nowInTz } from "@/lib/dates/provider-tz";
import { filterLedgerRowsForLocation, getProviderReportContext } from "@/lib/reports/provider-report-utils";
import {
  mapFinanceLedgerRowToProviderUi,
  type ProviderLedgerUiRow,
} from "@/lib/provider/provider-ledger-transaction-view";

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
    let fromDate: Date;
    const businessNow = nowInTz(reportContext.timezone);
    switch (period) {
      case "today":
        fromDate = fromBusinessTime(startOfDay(businessNow), reportContext.timezone);
        break;
      case "week":
        fromDate = fromBusinessTime(startOfWeek(businessNow, { weekStartsOn: 1 }), reportContext.timezone);
        break;
      case "month":
        fromDate = fromBusinessTime(startOfMonth(businessNow), reportContext.timezone);
        break;
      case "3months":
        fromDate = fromBusinessTime(subMonths(businessNow, 3), reportContext.timezone);
        break;
      case "year":
        fromDate = fromBusinessTime(subMonths(businessNow, 12), reportContext.timezone);
        break;
      case "all":
        fromDate = new Date(2000, 0, 1);
        break;
      default: {
        const tz = reportContext.timezone;
        const fromYmd = formatDateYmd(subDays(businessNow, 29), tz);
        const todayYmd = formatDateYmd(businessNow, tz);
        fromDate = new Date(dateRangeBoundsUtc(fromYmd, todayYmd, tz).fromIso);
        break;
      }
    }

    const fetchLimit = Math.min(limit * 3, 600);

    const query = supabaseAdmin
      .from("finance_transactions")
      .select("id, transaction_type, amount, net, created_at, description, booking_id, product_order_id, metadata")
      .eq("provider_id", providerId)
      .gte("created_at", fromDate.toISOString())
      .order("created_at", { ascending: false })
      .limit(fetchLimit);

    const { data: txnsRaw } = await query;
    const txns = await filterLedgerRowsForLocation(supabaseAdmin, providerId, txnsRaw ?? [], locationId);

    const mapped: ProviderLedgerUiRow[] = txns
      .map((t: any) => mapFinanceLedgerRowToProviderUi(t))
      .filter((x): x is ProviderLedgerUiRow => x != null);

    const transactions = mapped.slice(0, limit);

    return successResponse(transactions);
  } catch (error) {
    console.error("Error fetching transactions:", error);
    return handleApiError(error, "Failed to load transactions");
  }
}
