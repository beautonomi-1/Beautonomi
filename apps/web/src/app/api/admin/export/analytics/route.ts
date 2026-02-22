import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * GET /api/admin/export/analytics
 * 
 * Export analytics data to CSV (rate limited)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRoleInApi(['superadmin']);
    const { allowed, retryAfter } = checkRateLimit(auth.user.id, "export:analytics");
    if (!allowed) {
      return errorResponse(
        `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
        "RATE_LIMIT_EXCEEDED",
        429
      );
    }

    const supabase = await getSupabaseServer();

    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "30d";
    const _reportType = searchParams.get("report_type") || "summary";
    void _reportType;

    const now = new Date();
    let startDate: Date;

    switch (period) {
      case "7d":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "30d":
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case "90d":
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case "1y":
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Get summary statistics
    const [
      { count: totalUsers } = { count: 0 },
      { count: totalProviders } = { count: 0 },
      { count: totalBookings } = { count: 0 },
      { data: revenueData } = { data: [] },
    ] = await Promise.all([
      supabase
        .from("users")
        .select("*", { count: "exact", head: true })
        .eq("role", "customer")
        .gte("created_at", startDate.toISOString()),
      supabase
        .from("providers")
        .select("*", { count: "exact", head: true })
        .gte("created_at", startDate.toISOString()),
      supabase
        .from("bookings")
        .select("*", { count: "exact", head: true })
        .gte("created_at", startDate.toISOString()),
      supabase
        .from("finance_transactions")
        .select("net, transaction_type")
        .gte("created_at", startDate.toISOString())
        .in("transaction_type", ["payment", "additional_charge_payment"]),
    ]);

    const totalRevenue = (revenueData || []).reduce((sum, t) => sum + Math.abs(t.net || 0), 0);

    // Convert to CSV
    const headers = ["Metric", "Value", "Period", "Date Range"];
    const rows = [
      ["Total Users", totalUsers, period, `${startDate.toISOString().split("T")[0]} to ${now.toISOString().split("T")[0]}`],
      ["Total Providers", totalProviders, period, `${startDate.toISOString().split("T")[0]} to ${now.toISOString().split("T")[0]}`],
      ["Total Bookings", totalBookings, period, `${startDate.toISOString().split("T")[0]} to ${now.toISOString().split("T")[0]}`],
      ["Total Revenue", totalRevenue.toFixed(2), period, `${startDate.toISOString().split("T")[0]} to ${now.toISOString().split("T")[0]}`],
    ];

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");

    return new Response(csvContent, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="analytics-export-${period}-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to export analytics");
  }
}
