import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_USERS_TRUST } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

type BlockRow = {
  id: string;
  blocker_id: string;
  blocked_user_id: string;
  reason: string | null;
  created_at: string;
};

/**
 * GET /api/admin/user-blocks
 * List user_blocks for trust ops (tenant-scoped).
 * Query: limit, offset, blocker_id, blocked_user_id, user_id (matches either side)
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_USERS_TRUST, request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const { searchParams } = new URL(request.url);
    const blockerId = searchParams.get("blocker_id")?.trim() || "";
    const blockedUserId = searchParams.get("blocked_user_id")?.trim() || "";
    const userId = searchParams.get("user_id")?.trim() || "";
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);
    const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10), 0);

    let query = supabase
      .from("user_blocks")
      .select("id, blocker_id, blocked_user_id, reason, created_at", { count: "exact" })
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (blockerId) query = query.eq("blocker_id", blockerId);
    if (blockedUserId) query = query.eq("blocked_user_id", blockedUserId);
    if (userId && !blockerId && !blockedUserId) {
      query = query.or(`blocker_id.eq.${userId},blocked_user_id.eq.${userId}`);
    }

    const { data: rows, error, count } = await query;
    if (error) return handleApiError(error, "Failed to fetch user blocks");

    const blockRows = (rows ?? []) as BlockRow[];
    const userIds = [
      ...new Set(
        blockRows.flatMap((r) => [r.blocker_id, r.blocked_user_id].filter(Boolean)),
      ),
    ];

    const userMap: Record<string, { full_name?: string | null; email?: string | null }> = {};
    if (userIds.length > 0) {
      const [{ data: profiles }, { data: users }] = await Promise.all([
        supabase.from("user_profiles").select("user_id, full_name").in("user_id", userIds),
        supabase.from("users").select("id, email, full_name").in("id", userIds),
      ]);
      for (const u of users ?? []) {
        userMap[u.id as string] = {
          full_name: (u as { full_name?: string }).full_name ?? null,
          email: (u as { email?: string }).email ?? null,
        };
      }
      for (const p of profiles ?? []) {
        const uid = p.user_id as string;
        userMap[uid] = {
          ...userMap[uid],
          full_name: (p as { full_name?: string }).full_name ?? userMap[uid]?.full_name ?? null,
        };
      }
    }

    const data = blockRows.map((r) => ({
      ...r,
      blocker: userMap[r.blocker_id] ?? null,
      blocked: userMap[r.blocked_user_id] ?? null,
    }));

    return successResponse({
      data,
      meta: { limit, offset, total: count ?? data.length },
      has_more: (count ?? 0) > offset + limit,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch user blocks");
  }
}
