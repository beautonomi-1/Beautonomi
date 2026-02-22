import { NextRequest } from "next/server";
import { requireRoleInApi, getProviderIdForUser, notFoundResponse, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { subDays } from "date-fns";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request,
    );

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "10", 10), 50);
    const since = subDays(new Date(), 14);

    const [bookingsResult, paymentsResult, reviewsResult] = await Promise.all([
      supabaseAdmin
        .from("bookings")
        .select("id, status, created_at, scheduled_at, customers(full_name)")
        .eq("provider_id", providerId)
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false })
        .limit(limit * 2),

      supabaseAdmin
        .from("finance_transactions")
        .select("id, transaction_type, amount, net, created_at, booking_id")
        .eq("provider_id", providerId)
        .in("transaction_type", ["provider_earnings", "payout"])
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false })
        .limit(limit),

      supabaseAdmin
        .from("reviews")
        .select("id, rating, comment, created_at, customers(full_name)")
        .eq("provider_id", providerId)
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    const activities: {
      id: string;
      type: string;
      description: string;
      created_at: string;
      data?: { booking_id?: string; client_name?: string; amount?: number };
    }[] = [];

    (bookingsResult.data || []).forEach((b: any) => {
      const clientName = b.customers?.full_name || "Walk-in";
      let type = "booking_created";
      let desc = `New booking from ${clientName}`;

      if (b.status === "completed") {
        type = "booking_completed";
        desc = `Booking with ${clientName} completed`;
      } else if (b.status === "cancelled") {
        type = "booking_cancelled";
        desc = `Booking with ${clientName} cancelled`;
      }

      activities.push({
        id: `booking-${b.id}`,
        type,
        description: desc,
        created_at: b.created_at,
        data: { booking_id: b.id, client_name: clientName },
      });
    });

    (paymentsResult.data || []).forEach((p: any) => {
      const amount = Number(p.net ?? p.amount ?? 0);
      activities.push({
        id: `payment-${p.id}`,
        type: "payment_received",
        description:
          p.transaction_type === "payout"
            ? `Payout processed`
            : `Payment received`,
        created_at: p.created_at,
        data: { booking_id: p.booking_id, amount },
      });
    });

    (reviewsResult.data || []).forEach((r: any) => {
      const clientName = r.customers?.full_name || "Client";
      activities.push({
        id: `review-${r.id}`,
        type: "new_review",
        description: `${clientName} left a ${r.rating}-star review`,
        created_at: r.created_at,
        data: { client_name: clientName },
      });
    });

    activities.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    return successResponse(activities.slice(0, limit));
  } catch (error) {
    console.error("Error in activity feed:", error);
    return handleApiError(error, "Failed to load activity feed");
  }
}
