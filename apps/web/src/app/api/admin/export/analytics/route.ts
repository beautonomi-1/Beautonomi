import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, handleApiError, errorResponse  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_OVERVIEW } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { fetchFinanceLedgerRowsForTenant } from "@/lib/admin/finance-ledger-tenant";
import { checkAdminExportRateLimit } from "@/lib/rate-limit/admin-export";

/**
 * GET /api/admin/export/analytics
 * 
 * Export analytics data to CSV (rate limited)
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_OVERVIEW, request);
    const { allowed, retryAfter } = await checkAdminExportRateLimit(user.id, "export:analytics");
    if (!allowed) {
      return errorResponse(
        `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
        "RATE_LIMIT_EXCEEDED",
        429
      );
    }

    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveAdminApiTenantId(request);

    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "30d";
    const reportType = searchParams.get("report_type") || "summary";
    const startDateParam = searchParams.get("start_date");
    const endDateParam = searchParams.get("end_date");

    const now = new Date();
    let startDate: Date;
    let endDate = now;

    if (startDateParam && endDateParam) {
      startDate = new Date(`${startDateParam}T00:00:00.000Z`);
      endDate = new Date(`${endDateParam}T23:59:59.999Z`);
    } else {
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
    }

    const admin = getSupabaseAdmin();
    const { data: scopedCustomersRpc, error: scopedCustomersErr } = await admin.rpc(
      "admin_count_users_in_tenant_scope_created_between",
      {
        p_tenant_id: tenantId,
        p_role: "customer",
        p_created_at_min: startDate.toISOString(),
        p_created_at_max: endDate.toISOString(),
      }
    );
    let totalUsers = 0;
    if (scopedCustomersErr) {
      console.warn(
        "admin_count_users_in_tenant_scope_created_between (export analytics):",
        scopedCustomersErr.message,
      );
    } else if (scopedCustomersRpc != null) {
      const n =
        typeof scopedCustomersRpc === "number" ? scopedCustomersRpc : Number(scopedCustomersRpc);
      if (Number.isFinite(n)) totalUsers = n;
    }

    // Get summary statistics
    const [
      { count: totalProviders } = { count: 0 },
      { count: totalBookings } = { count: 0 },
      revenueData = [],
    ] = await Promise.all([
      supabase
        .from("providers")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .gte("created_at", startDate.toISOString()),
      supabase
        .from("bookings")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .gte("created_at", startDate.toISOString()),
      (async () => {
        try {
          return await fetchFinanceLedgerRowsForTenant(
            supabase,
            tenantId,
            { start: startDate.toISOString(), end: endDate.toISOString() },
            {
              transactionTypes: ["payment", "additional_charge_payment"],
            }
          );
        } catch {
          return [];
        }
      })(),
    ]);

    const totalRevenue = (revenueData || []).reduce(
      (sum, t) => sum + Math.abs(Number(t.net || 0)),
      0
    );

    // Convert to CSV
    const reportLabel = reportType === "revenue" ? "Revenue report" : "Analytics summary";
    const dateRangeLabel = `${startDate.toISOString().split("T")[0]} to ${endDate.toISOString().split("T")[0]}`;
    const headers = ["Report", "Metric", "Value", "Period", "Date Range"];
    const rows = [
      [reportLabel, "Customers (tenant scope)", totalUsers, period, dateRangeLabel],
      [reportLabel, "Total Providers", totalProviders, period, dateRangeLabel],
      [reportLabel, "Total Bookings", totalBookings, period, dateRangeLabel],
      [reportLabel, "Settled Service GMV", totalRevenue.toFixed(2), period, dateRangeLabel],
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
