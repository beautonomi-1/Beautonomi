/**
 * GET /api/admin/safety/logs
 * List safety events (panic, check_in, escalation). Superadmin only.
 */

import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit")) || 50, 200);
    const offset = Number(searchParams.get("offset")) || 0;
    const eventType = searchParams.get("event_type") || undefined;

    const supabase = getSupabaseAdmin();
    let q = supabase
      .from("safety_events")
      .select("id, user_id, booking_id, event_type, status, aura_request_id, metadata, created_at, updated_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (eventType) q = q.eq("event_type", eventType);

    const { data, error, count } = await q;

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
