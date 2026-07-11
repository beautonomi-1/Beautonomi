import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getOffsetPaginationParams,
  handleApiError,
  requireRoleInApi,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

/**
 * GET /api/admin/paycloud-operations/payments
 *
 * Search PayCloud payments with filters. Superadmin only.
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const { searchParams } = new URL(request.url);
    const { limit, offset } = getOffsetPaginationParams(request, { defaultLimit: 50, maxLimit: 200 });

    const providerId = searchParams.get("provider_id");
    const status = searchParams.get("status");
    const environment = searchParams.get("environment");
    const amountMatchStatus = searchParams.get("amount_match_status");
    const exceptionsOnly = searchParams.get("exceptions_only") === "true";
    const entityType = searchParams.get("entity_type");
    const search = searchParams.get("search")?.trim();
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    let query = (supabase.from("provider_paycloud_payments") as any)
      .select(
        `
          id,
          tenant_id,
          provider_id,
          terminal_id,
          merchant_order_no,
          paycloud_order_id,
          trans_status,
          amount,
          tip_amount,
          cashback_amount,
          expected_amount,
          currency,
          amount_match_status,
          status,
          environment,
          entity_type,
          entity_id,
          booking_id,
          sale_id,
          pay_scenario,
          pay_method_id,
          response_code,
          error_message,
          created_at,
          updated_at,
          provider:providers(id, business_name, slug),
          terminal:paycloud_terminals(id, display_name, terminal_sn, status)
        `,
        { count: "exact" },
      )
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (providerId) query = query.eq("provider_id", providerId);
    if (status) query = query.eq("status", status);
    if (environment) query = query.eq("environment", environment);
    if (exceptionsOnly) {
      query = query.neq("amount_match_status", "exact");
    } else if (amountMatchStatus) {
      query = query.eq("amount_match_status", amountMatchStatus);
    }
    if (entityType) query = query.eq("entity_type", entityType);
    if (from) query = query.gte("created_at", from);
    if (to) query = query.lte("created_at", to);
    if (search) {
      const safe = search.replace(/[%_]/g, "");
      const uuidLike =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          search,
        );
      const clauses = [
        `merchant_order_no.ilike.%${safe}%`,
        `paycloud_order_id.ilike.%${safe}%`,
        `entity_id.ilike.%${safe}%`,
      ];
      if (uuidLike) clauses.push(`id.eq.${search}`);
      query = query.or(clauses.join(","));
    }

    const { data, error, count } = await query;
    if (error) throw error;

    return successResponse({
      items: data ?? [],
      total: count ?? 0,
      limit,
      offset,
      hasMore: (count ?? 0) > offset + limit,
    });
  } catch (error) {
    return handleApiError(error, "Failed to search PayCloud payments");
  }
}
