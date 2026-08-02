import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  successResponse,
  errorResponse,
  handleApiError,
  requireAuthInApi,
} from "@/lib/supabase/api-helpers";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";

const BLOCK_REASONS = ["harassment", "spam", "other"] as const;

async function loadBlockedUsersWithProfiles(
  blockerId: string,
  tenantId: string | null,
) {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("user_blocks")
    .select("id, blocked_user_id, reason, created_at")
    .eq("blocker_id", blockerId)
    .order("created_at", { ascending: false });

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data: blocks, error } = await query;
  if (error) throw error;

  const userIds = (blocks ?? []).map((b) => b.blocked_user_id as string).filter(Boolean);
  if (userIds.length === 0) {
    return [];
  }

  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("user_id, full_name, avatar_url")
    .in("user_id", userIds);

  const profileByUserId = new Map(
    (profiles ?? []).map((p) => [p.user_id as string, p]),
  );

  return (blocks ?? []).map((b) => {
    const profile = profileByUserId.get(b.blocked_user_id as string);
    return {
      id: b.id,
      user_id: b.blocked_user_id,
      reason: b.reason,
      blocked_at: b.created_at,
      full_name: profile?.full_name ?? null,
      avatar_url: profile?.avatar_url ?? null,
    };
  });
}

/**
 * GET /api/me/blocks — list users blocked by the current user
 * POST /api/me/blocks — block a user { user_id, reason? }
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuthInApi(request);
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const rows = await loadBlockedUsersWithProfiles(user.id, tenantId);
    return successResponse(rows);
  } catch (error) {
    return handleApiError(error, "Failed to list blocked users");
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuthInApi(request);
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const body = await request.json();

    const blockedUserId =
      typeof body.user_id === "string" ? body.user_id.trim() : "";
    const providerId =
      typeof body.provider_id === "string" ? body.provider_id.trim() : "";

    let resolvedBlockedUserId = blockedUserId;
    if (!resolvedBlockedUserId && providerId) {
      const { data: prov } = await getSupabaseAdmin()
        .from("providers")
        .select("user_id")
        .eq("id", providerId)
        .maybeSingle();
      resolvedBlockedUserId = (prov as { user_id?: string } | null)?.user_id?.trim() ?? "";
    }

    if (!resolvedBlockedUserId) {
      return errorResponse("user_id or provider_id is required", "VALIDATION_ERROR", 400);
    }
    if (resolvedBlockedUserId === user.id) {
      return errorResponse("You cannot block yourself", "VALIDATION_ERROR", 400);
    }

    let reason: string | null = null;
    if (body.reason != null && body.reason !== "") {
      if (!BLOCK_REASONS.includes(body.reason)) {
        return errorResponse(
          "reason must be harassment, spam, or other",
          "VALIDATION_ERROR",
          400,
        );
      }
      reason = body.reason;
    }

    const supabase = getSupabaseAdmin();

    const { data: target } = await supabase
      .from("users")
      .select("id")
      .eq("id", resolvedBlockedUserId)
      .maybeSingle();
    if (!target) {
      return errorResponse("User not found", "NOT_FOUND", 404);
    }

    const { data: existing } = await supabase
      .from("user_blocks")
      .select("id, blocked_user_id, reason, created_at")
      .eq("blocker_id", user.id)
      .eq("blocked_user_id", resolvedBlockedUserId)
      .maybeSingle();

    if (existing) {
      return successResponse(
        {
          id: existing.id,
          user_id: existing.blocked_user_id,
          reason: existing.reason,
          blocked_at: existing.created_at,
          already_blocked: true,
        },
        200,
      );
    }

    const { data: row, error } = await supabase
      .from("user_blocks")
      .insert({
        blocker_id: user.id,
        blocked_user_id: resolvedBlockedUserId,
        tenant_id: tenantId,
        reason,
      })
      .select("id, blocked_user_id, reason, created_at")
      .single();

    if (error) return handleApiError(error, "Failed to block user");

    return successResponse(
      {
        id: row.id,
        user_id: row.blocked_user_id,
        reason: row.reason,
        blocked_at: row.created_at,
        already_blocked: false,
      },
      201,
    );
  } catch (error) {
    return handleApiError(error, "Failed to block user");
  }
}
