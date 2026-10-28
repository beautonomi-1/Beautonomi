import { NextRequest } from "next/server";
import {
  getProviderIdForUser,
  handleApiError,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/requirePermission";

function csvEscape(value: unknown): string {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

/**
 * GET /api/provider/billing-history/export
 * CSV export for billing activity (same filters as the list, no paging cap).
 */
export async function GET(request: NextRequest) {
  try {
    const permissionCheck = await requirePermission("manage_finance", request);
    if (!permissionCheck.authorized) return permissionCheck.response!;

    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const sp = request.nextUrl.searchParams;
    const type = sp.get("type");
    const dateFrom = sp.get("date_from");
    const dateTo = sp.get("date_to");

    const supabaseAdmin = getSupabaseAdmin();
    let query = supabaseAdmin
      .from("provider_billing_activity")
      .select("*")
      .eq("provider_id", providerId)
      .order("occurred_at", { ascending: false });

    if (type) query = query.eq("type", type);
    if (dateFrom) query = query.gte("occurred_at", dateFrom);
    if (dateTo) query = query.lte("occurred_at", `${dateTo}T23:59:59.999Z`);

    const { data: rows, error } = await query;
    if (error) throw error;

    const header = [
      "occurred_at",
      "type",
      "direction",
      "status",
      "amount",
      "currency",
      "description",
    ];
    const lines = [header.map(csvEscape).join(",")];
    for (const r of rows ?? []) {
      const row = r as Record<string, unknown>;
      lines.push(
        [
          row.occurred_at,
          row.type,
          row.direction,
          row.status,
          row.amount,
          row.currency,
          row.description,
        ]
          .map(csvEscape)
          .join(","),
      );
    }

    return new Response(lines.join("\n"), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="bills-paid.csv"`,
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to export billing history");
  }
}
