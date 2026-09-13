import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("audit_logs")
      .select(
        "id, action, actor_user_id, actor_role, status, metadata, created_at, before_json, after_json",
      )
      .eq("module", "finance")
      .like("action", "finance.fx.%")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) throw error;

    const actorIds = [...new Set((data ?? []).map((r) => r.actor_user_id).filter(Boolean))];
    let actors: Record<string, { full_name?: string; email?: string }> = {};
    if (actorIds.length > 0) {
      const { data: users } = await supabase
        .from("users")
        .select("id, full_name, email")
        .in("id", actorIds as string[]);
      for (const u of users ?? []) {
        actors[(u as { id: string }).id] = u as { full_name?: string; email?: string };
      }
    }

    const rows = (data ?? []).map((row) => ({
      ...row,
      actor: row.actor_user_id ? actors[row.actor_user_id as string] ?? null : null,
    }));

    return successResponse({ rows });
  } catch (error) {
    return handleApiError(error, "Failed to load FX audit log");
  }
}
