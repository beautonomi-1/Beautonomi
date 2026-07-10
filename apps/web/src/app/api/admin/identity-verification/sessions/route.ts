/**
 * GET /api/admin/identity-verification/sessions
 *
 * Paginated list of Didit verification sessions with filtering.
 * Superadmin only.
 */
import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

function sanitizeIlikeTerm(raw: string) {
  return raw.trim().replace(/[%_\\,]/g, "");
}

const UUID_RE =
  /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);

    const { searchParams } = new URL(request.url);
    const page      = Math.max(1, Number(searchParams.get("page") ?? "1"));
    const perPage   = Math.min(100, Math.max(1, Number(searchParams.get("per_page") ?? "25")));
    const status    = searchParams.get("status") ?? "";
    const persona   = searchParams.get("persona") ?? "";
    const sessionKind = searchParams.get("session_kind") ?? "";
    const hasFlags  = searchParams.get("has_flags") === "true";
    const nameMismatch = searchParams.get("name_mismatch") === "true";
    const q         = sanitizeIlikeTerm(searchParams.get("q") ?? "");

    const supabase = getSupabaseAdmin();

    let searchOrClauses: string[] | null = null;

    if (q) {
      const orClauses: string[] = [];

      if (UUID_RE.test(q)) {
        orClauses.push(`id.eq.${q}`, `user_id.eq.${q}`, `provider_id.eq.${q}`);
      }

      orClauses.push(`provider_session_id.ilike.%${q}%`);

      const { data: matchingUsers } = await supabase
        .from("users")
        .select("id")
        .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
        .limit(200);
      const userIds = (matchingUsers ?? []).map((u: { id: string }) => u.id);
      if (userIds.length > 0) {
        orClauses.push(`user_id.in.(${userIds.join(",")})`);
      }

      const { data: matchingProviders } = await supabase
        .from("providers")
        .select("id")
        .ilike("business_name", `%${q}%`)
        .limit(200);
      const providerIds = (matchingProviders ?? []).map((p: { id: string }) => p.id);
      if (providerIds.length > 0) {
        orClauses.push(`provider_id.in.(${providerIds.join(",")})`);
      }

      searchOrClauses = orClauses;
    }

    let query = supabase
      .from("identity_verification_sessions")
      .select(`
        id, persona_type, session_kind, provider, provider_session_id, status,
        name_mismatch_flag, identity_dedupe_flag, under_age_flag,
        rejection_reason, created_at, updated_at, user_id, provider_id, tenant_id,
        users:user_id ( email, full_name )
      `, { count: "exact" })
      .order("created_at", { ascending: false })
      .range((page - 1) * perPage, page * perPage - 1);

    if (status) query = query.eq("status", status);
    if (persona) query = query.eq("persona_type", persona);
    if (sessionKind === "user" || sessionKind === "business") {
      query = query.eq("session_kind", sessionKind);
    }
    if (hasFlags) {
      query = query.or("name_mismatch_flag.eq.true,identity_dedupe_flag.eq.true,under_age_flag.eq.true");
    }
    if (nameMismatch) query = query.eq("name_mismatch_flag", true);
    if (searchOrClauses) query = query.or(searchOrClauses.join(","));

    const { data, count, error } = await query;
    if (error) throw error;

    const items = (data ?? []).map((row: Record<string, unknown>) => {
      const user = row.users as { email?: string; full_name?: string } | null;
      return {
        ...row,
        users: undefined,
        user_email: user?.email,
        user_name: user?.full_name,
      };
    });

    return successResponse({
      items,
      total:    count ?? 0,
      page,
      per_page: perPage,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
