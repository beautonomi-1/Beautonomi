import { NextRequest } from "next/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { subDays, subMonths, startOfDay, startOfWeek, startOfMonth } from "date-fns";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");
    const sp = request.nextUrl.searchParams;
    const period = sp.get("period") || "month";
    const limit = Math.min(parseInt(sp.get("limit") || "50", 10), 200);

    const locationId = sp.get("location_id") || null;
    let fromDate: Date;
    switch (period) {
      case "today": fromDate = startOfDay(new Date()); break;
      case "week": fromDate = startOfWeek(new Date(), { weekStartsOn: 1 }); break;
      case "month": fromDate = startOfMonth(new Date()); break;
      case "3months": fromDate = subMonths(new Date(), 3); break;
      case "year": fromDate = subMonths(new Date(), 12); break;
      case "all": fromDate = new Date(2000, 0, 1); break;
      default: fromDate = subDays(new Date(), 30);
    }

    const query = supabaseAdmin
      .from("finance_transactions")
      .select("id, transaction_type, amount, net, created_at, booking_id, metadata")
      .eq("provider_id", providerId)
      .gte("created_at", fromDate.toISOString())
      .order("created_at", { ascending: false })
      .limit(limit);

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
        // No booking-linked transactions in this set; keep only non-booking (payouts, fees)
        txns = txns.filter((t: any) => !t.booking_id);
      }
    }

    const typeMap: Record<string, string> = {
      provider_earnings: "payment",
      payout: "payout",
      platform_fee: "fee",
      travel_fee: "payment",
      tip: "tip",
      refund: "refund",
    };

    const transactions = txns.map((t: any) => {
      const net = Number(t.net ?? t.amount ?? 0);
      let type = typeMap[t.transaction_type] || "payment";
      if (t.transaction_type === "provider_earnings" && net < 0) type = "refund";

      return {
        id: t.id,
        type,
        amount: Math.abs(net),
        description: t.transaction_type === "payout"
          ? "Payout to bank"
          : t.transaction_type === "platform_fee"
            ? "Platform fee"
            : net < 0 ? "Refund" : "Service payment",
        status: "completed",
        created_at: t.created_at,
        client_name: null,
      };
    });

    return successResponse(transactions);
  } catch (error) {
    console.error("Error fetching transactions:", error);
    return handleApiError(error, "Failed to load transactions");
  }
}
