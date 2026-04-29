import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { subDays, subMonths, startOfDay, startOfWeek, startOfMonth } from "date-fns";
import {
  mapFinanceLedgerRowToProviderUi,
  type ProviderLedgerUiRow,
} from "@/lib/provider/provider-ledger-transaction-view";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);

    const supabaseAdmin = getSupabaseAdmin();

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");
    const sp = request.nextUrl.searchParams;
    const period = sp.get("period") || "month";
    const limit = Math.min(parseInt(sp.get("limit") || "50", 10), 200);

    const locationId = sp.get("location_id") || null;
    let fromDate: Date;
    switch (period) {
      case "today":
        fromDate = startOfDay(new Date());
        break;
      case "week":
        fromDate = startOfWeek(new Date(), { weekStartsOn: 1 });
        break;
      case "month":
        fromDate = startOfMonth(new Date());
        break;
      case "3months":
        fromDate = subMonths(new Date(), 3);
        break;
      case "year":
        fromDate = subMonths(new Date(), 12);
        break;
      case "all":
        fromDate = new Date(2000, 0, 1);
        break;
      default:
        fromDate = subDays(new Date(), 30);
    }

    const fetchLimit = Math.min(limit * 3, 600);

    const query = supabaseAdmin
      .from("finance_transactions")
      .select("id, transaction_type, amount, net, created_at, description, booking_id, metadata")
      .eq("provider_id", providerId)
      .gte("created_at", fromDate.toISOString())
      .order("created_at", { ascending: false })
      .limit(fetchLimit);

    const { data: txnsRaw } = await query;
    let txns = txnsRaw ?? [];

    // Filter by location_id when provided (match portal finance behaviour)
    if (locationId && txns.length > 0) {
      const bookingIds = [...new Set(txns.filter((t: any) => t.booking_id).map((t: any) => t.booking_id))];
      if (bookingIds.length > 0) {
        const { data: bookings } = await supabaseAdmin
          .from("bookings")
          .select("id")
          .in("id", bookingIds)
          .eq("location_id", locationId);
        const allowedIds = new Set((bookings ?? []).map((b: any) => b.id));
        txns = txns.filter((t: any) => !t.booking_id || allowedIds.has(t.booking_id));
      } else {
        txns = txns.filter((t: any) => !t.booking_id);
      }
    }

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
