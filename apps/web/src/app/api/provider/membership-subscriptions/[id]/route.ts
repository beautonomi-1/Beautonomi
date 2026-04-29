import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  errorResponse,
  handleApiError,
  getProviderIdForUser,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";

const patchSchema = z.object({
  status: z.enum(["active", "cancelled", "expired"]).optional(),
  /** ISO 8601 datetime or null to clear (open-ended). */
  expires_at: z.string().nullable().optional(),
});

/**
 * PATCH /api/provider/membership-subscriptions/[id]
 *
 * Updates a customer salon membership (`user_memberships`) for the
 * authenticated provider (cancel, set expiry, reactivate).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request,
    );
    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("Validation failed", "VALIDATION_ERROR", 400, parsed.error.issues);
    }

    const providerId = await getProviderIdForUser(user.id, supabase);
    const admin = getSupabaseAdmin();

    const { data: row, error: fetchErr } = await (admin as any)
      .from("user_memberships")
      .select("id, provider_id, user_id, status")
      .eq("id", id)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!row) return notFoundResponse("Membership subscription not found");

    if (user.role !== "superadmin") {
      if (!providerId || row.provider_id !== providerId) {
        return notFoundResponse("Membership subscription not found");
      }
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (parsed.data.status !== undefined) {
      updates.status = parsed.data.status;
      if (parsed.data.status === "cancelled") {
        updates.cancelled_at = new Date().toISOString();
      } else if (parsed.data.status === "active") {
        updates.cancelled_at = null;
      }
    }

    if (parsed.data.expires_at !== undefined) {
      updates.expires_at = parsed.data.expires_at;
      const exp = parsed.data.expires_at ? new Date(parsed.data.expires_at) : null;
      if (
        exp &&
        Number.isFinite(exp.getTime()) &&
        exp.getTime() < Date.now() &&
        parsed.data.status !== "active"
      ) {
        updates.status = "expired";
      }
    }

    const { data: updated, error: updErr } = await (admin as any)
      .from("user_memberships")
      .update(updates)
      .eq("id", id)
      .select(
        "id, user_id, plan_id, provider_id, status, started_at, expires_at, cancelled_at, metadata, updated_at",
      )
      .single();

    if (updErr) throw updErr;
    return successResponse({ subscription: updated });
  } catch (error) {
    return handleApiError(error, "Failed to update membership subscription");
  }
}
