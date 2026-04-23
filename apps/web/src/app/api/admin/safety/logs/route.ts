/**
 * GET /api/admin/safety/logs
 * List safety events (panic, check_in, escalation). Superadmin-only.
 *
 * Query:
 * - `scope=global` — all tenants (superadmin global picker).
 * - Otherwise tenant-scoped via `resolveAdminApiTenantId` (host + tenant picker).
 * - `event_type`, `status` (comma list), `since` (ISO), `limit`, `offset`.
 */

import { NextRequest } from "next/server";
import { requireSuperadmin, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { fetchAllProviderIdsForTenant } from "@/lib/tenant/admin-tenant-scope";
import {
  buildSafetyLogsTenantOrFilter,
  fetchRecentBookingIdsForTenantSafetyList,
  fetchTenantProviderSafetyUserIds,
} from "@/lib/admin/safety-events-tenant-scope";

const SELECT_COLS =
  "id, user_id, booking_id, event_type, status, aura_request_id, metadata, created_at, updated_at";

export async function GET(request: NextRequest) {
  try {
    await requireSuperadmin(request);
    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 200);
    const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
    const eventType = url.searchParams.get("event_type") || undefined;
    const statusRaw = url.searchParams.get("status");
    const statusIn = statusRaw
      ? statusRaw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;
    const since = url.searchParams.get("since") || undefined;
    const scope = url.searchParams.get("scope");
    const isGlobalView = scope === "global";

    const supabase = getSupabaseAdmin();

    let q = supabase.from("safety_events").select(SELECT_COLS, { count: "exact" });

    if (!isGlobalView) {
      const tenantId = await resolveAdminApiTenantId(request);
      const tenantProviderIds = await fetchAllProviderIdsForTenant(supabase, tenantId);
      const userIds = await fetchTenantProviderSafetyUserIds(supabase, tenantId, tenantProviderIds);
      const bookingIds = await fetchRecentBookingIdsForTenantSafetyList(supabase, tenantId, 4000);
      const orFilter = buildSafetyLogsTenantOrFilter(userIds, bookingIds);
      if (!orFilter) {
        return successResponse({
          data: [] as unknown[],
          total: 0,
          limit,
          offset,
        });
      }
      q = q.or(orFilter);
    }

    if (eventType) q = q.eq("event_type", eventType);
    if (statusIn && statusIn.length > 0) q = q.in("status", statusIn);
    if (since) q = q.gte("created_at", since);

    const end = offset + limit - 1;
    const { data, error, count } = await q.order("created_at", { ascending: false }).range(offset, end);

    if (error) throw error;

    return successResponse({
      data: data ?? [],
      total: count ?? 0,
      limit,
      offset,
    });
  } catch (error) {
    return handleApiError(error as Error, "Failed to fetch safety logs");
  }
}
