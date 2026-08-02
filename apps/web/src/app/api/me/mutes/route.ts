import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  successResponse,
  errorResponse,
  handleApiError,
  requireAuthInApi,
} from "@/lib/supabase/api-helpers";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";

async function loadMutedUsersWithProfiles(muterId: string, tenantId: string | null) {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("user_mutes")
    .select("id, muted_user_id, created_at")
    .eq("muter_id", muterId)
    .order("created_at", { ascending: false });

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data: mutes, error } = await query;
  if (error) throw error;

  const userIds = (mutes ?? []).map((m) => m.muted_user_id as string).filter(Boolean);
  if (userIds.length === 0) return [];

  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("user_id, full_name, avatar_url")
    .in("user_id", userIds);

  const profileByUserId = new Map(
    (profiles ?? []).map((p) => [p.user_id as string, p]),
  );

  return (mutes ?? []).map((m) => {
    const profile = profileByUserId.get(m.muted_user_id as string);
    return {
      id: m.id,
      user_id: m.muted_user_id,
      muted_at: m.created_at,
      full_name: profile?.full_name ?? null,
      avatar_url: profile?.avatar_url ?? null,
    };
  });
}

/**
 * GET /api/me/mutes
 * POST /api/me/mutes — { user_id }
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuthInApi(request);
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const rows = await loadMutedUsersWithProfiles(user.id, tenantId);
    return successResponse(rows);
  } catch (error) {
    return handleApiError(error, "Failed to list muted users");
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuthInApi(request);
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const body = await request.json();

    const mutedUserId =
      typeof body.user_id === "string" ? body.user_id.trim() : "";
    if (!mutedUserId) {
      return errorResponse("user_id is required", "VALIDATION_ERROR", 400);
    }
    if (mutedUserId === user.id) {
      return errorResponse("You cannot mute yourself", "VALIDATION_ERROR", 400);
    }

    const supabase = getSupabaseAdmin();

    const { data: target } = await supabase
      .from("users")
      .select("id")
      .eq("id", mutedUserId)
      .maybeSingle();
    if (!target) {
      return errorResponse("User not found", "NOT_FOUND", 404);
    }

    const { data: existing } = await supabase
      .from("user_mutes")
      .select("id, muted_user_id, created_at")
      .eq("muter_id", user.id)
      .eq("muted_user_id", mutedUserId)
      .maybeSingle();

    if (existing) {
      return successResponse(
        {
          id: existing.id,
          user_id: existing.muted_user_id,
          muted_at: existing.created_at,
          already_muted: true,
        },
        200,
      );
    }

    const { data: row, error } = await supabase
      .from("user_mutes")
      .insert({
        muter_id: user.id,
        muted_user_id: mutedUserId,
        tenant_id: tenantId,
      })
      .select("id, muted_user_id, created_at")
      .single();

    if (error) return handleApiError(error, "Failed to mute user");

    return successResponse(
      {
        id: row.id,
        user_id: row.muted_user_id,
        muted_at: row.created_at,
        already_muted: false,
      },
      201,
    );
  } catch (error) {
    return handleApiError(error, "Failed to mute user");
  }
}
