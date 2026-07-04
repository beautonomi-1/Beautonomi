/**
 * GET  /api/admin/commercial/terminal-orders
 * PATCH already in [id]/route.ts pattern — order status updates
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_COMMERCIAL } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_COMMERCIAL, request);
    const tenantId = await resolveAdminApiTenantId(request);
    const supabase = getSupabaseAdmin();

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const perPage = Math.min(100, parseInt(searchParams.get("per_page") || "25", 10));
    const offset = (page - 1) * perPage;
    const statusFilter = searchParams.get("order_status");
    const modelFilter = searchParams.get("commercial_model");

    let query = supabase
      .from("terminal_orders")
      .select(
        `*,
        providers(id, business_name, slug),
        terminal_products(id, name, vendor, model)`,
        { count: "exact" },
      )
      .eq("tenant_id", tenantId)
      .range(offset, offset + perPage - 1)
      .order("created_at", { ascending: false });

    if (statusFilter) query = query.eq("order_status", statusFilter);
    if (modelFilter) query = query.eq("commercial_model", modelFilter);

    const { data, error, count } = await query;

    if (error) {
      return errorResponse("Failed to load orders", "LOAD_ERROR", 500, error);
    }

    return successResponse({ items: data ?? [], total: count ?? 0, page, per_page: perPage });
  } catch (error) {
    return handleApiError(error, "Failed to load terminal orders");
  }
}
