import { NextRequest } from "next/server";
import { requireAdminSection, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_OVERVIEW } from "@/lib/admin-sections";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { checkAdminExportRateLimit } from "@/lib/rate-limit/admin-export";
import { subDays } from "date-fns";

/**
 * GET /api/admin/export/gift-cards
 *
 * Export gift card orders as CSV. Rate-limited at 30/hr per admin user.
 * Gated on ADMIN_SECTION_OVERVIEW — same as the reports page that calls this.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_OVERVIEW, request);
    const { allowed, retryAfter } = await checkAdminExportRateLimit(user.id, "export:gift-cards");
    if (!allowed) {
      return new Response(
        JSON.stringify({
          error: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
          code: "RATE_LIMIT_EXCEEDED",
        }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      );
    }

    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "30d";

    const now = new Date();
    let startDate: Date;
    switch (period) {
      case "7d":
        startDate = subDays(now, 7);
        break;
      case "90d":
        startDate = subDays(now, 90);
        break;
      case "1y":
        startDate = subDays(now, 365);
        break;
      default:
        startDate = subDays(now, 30);
    }

    const { data: orders, error } = await supabase
      .from("gift_card_orders")
      .select(
        "id, created_at, status, amount, currency, recipient_email, sender_email, is_gift, quantity, code_count, tenant_id",
      )
      .eq("tenant_id", tenantId)
      .gte("created_at", startDate.toISOString())
      .order("created_at", { ascending: false })
      .limit(5000);

    if (error) {
      console.error("[export/gift-cards] query error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to query gift card orders", code: "QUERY_ERROR" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const headers = [
      "Order ID",
      "Created At",
      "Status",
      "Amount",
      "Currency",
      "Is Gift",
      "Quantity",
      "Sender Email",
      "Recipient Email",
    ];

    function csvCell(value: unknown): string {
      return `"${String(value ?? "").replace(/"/g, '""')}"`;
    }

    const rows = (orders ?? []).map((o) => [
      csvCell(o.id),
      csvCell(o.created_at ? new Date(o.created_at).toISOString() : ""),
      csvCell(o.status),
      csvCell(o.amount),
      csvCell(o.currency),
      csvCell(o.is_gift ? "Yes" : "No"),
      csvCell(o.quantity),
      csvCell(o.sender_email),
      csvCell(o.recipient_email),
    ].join(","));

    const csvContent = [headers.map(csvCell).join(","), ...rows].join("\n");
    const filename = `gift-cards-${period}-${now.toISOString().split("T")[0]}.csv`;

    return new Response(csvContent, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to export gift cards");
  }
}
