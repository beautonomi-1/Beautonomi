/**
 * PATCH /api/admin/safety/logs/[id]
 * Mark a safety incident resolved (superadmin). Clears nav / activity badges when no open rows remain.
 */

import { NextRequest } from "next/server";
import { requireSuperadmin, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const OPEN_STATUSES = ["created", "dispatched"] as const;

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireSuperadmin(request);
    const { id } = await ctx.params;
    if (!id) return errorResponse("Missing id", "BAD_REQUEST", 400);

    const body = (await request.json().catch(() => ({}))) as { status?: string };
    const nextStatus = String(body.status ?? "").toLowerCase();
    if (nextStatus !== "resolved") {
      return errorResponse("Only status=resolved is supported", "BAD_REQUEST", 400);
    }

    const supabase = getSupabaseAdmin();
    const { data: row, error: fetchErr } = await supabase
      .from("safety_events")
      .select("id, status")
      .eq("id", id)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!row) return errorResponse("Safety event not found", "NOT_FOUND", 404);

    if (!OPEN_STATUSES.includes(row.status as (typeof OPEN_STATUSES)[number])) {
      return errorResponse("Event is not open for resolution", "BAD_REQUEST", 400);
    }

    const { error: updErr } = await supabase
      .from("safety_events")
      .update({ status: "resolved", updated_at: new Date().toISOString() })
      .eq("id", id);

    if (updErr) throw updErr;

    return successResponse({ id, status: "resolved" });
  } catch (error) {
    return handleApiError(error as Error, "Failed to update safety event");
  }
}
