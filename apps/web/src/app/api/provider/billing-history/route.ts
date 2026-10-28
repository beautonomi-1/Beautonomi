import { NextRequest } from "next/server";
import {
  getProviderIdForUser,
  notFoundResponse,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/auth/requirePermission";

export async function GET(request: NextRequest) {
  try {
    const permissionCheck = await requirePermission("manage_finance", request);
    if (!permissionCheck.authorized) return permissionCheck.response!;

    const { user } = permissionCheck;
    const supabaseAdmin = getSupabaseAdmin();

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");

    const sp = request.nextUrl.searchParams;
    const limit = Math.min(Math.max(parseInt(sp.get("limit") ?? "50", 10) || 50, 1), 100);
    const offset = Math.max(parseInt(sp.get("offset") ?? "0", 10) || 0, 0);
    const type = sp.get("type");
    const dateFrom = sp.get("date_from");
    const dateTo = sp.get("date_to");

    let query = supabaseAdmin
      .from("provider_billing_activity")
      .select("*", { count: "exact" })
      .eq("provider_id", providerId)
      .order("occurred_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (type) query = query.eq("type", type);
    if (dateFrom) query = query.gte("occurred_at", dateFrom);
    if (dateTo) query = query.lte("occurred_at", `${dateTo}T23:59:59.999Z`);

    const { data: rows, error, count } = await query;

    if (error) {
      console.error("Error fetching billing history:", error);
      return handleApiError(error, "Failed to load billing history");
    }

    const items = (rows ?? []).map((r: Record<string, unknown>) => ({
      id: r.id,
      amount: Number(r.amount ?? 0),
      currency: r.currency,
      status: r.status,
      type: r.type,
      direction: r.direction,
      description: r.description,
      created_at: r.occurred_at,
      invoice_url: r.receipt_path ?? null,
    }));

    const total = count ?? items.length;
    return successResponse({
      items,
      total,
      limit,
      offset,
      has_more: total > offset + items.length,
    });
  } catch (error) {
    console.error("Error fetching billing history:", error);
    return handleApiError(error, "Failed to load billing history");
  }
}
