import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, forbiddenResponse } from "@/lib/supabase/api-helpers";
import { requireSuperadminPlatform } from "@/lib/admin/require-superadmin-platform";

/**
 * GET /api/admin/ads/campaigns
 * Superadmin-only. Paginated campaigns with provider name for oversight.
 * Query: status?, search?, limit (default 40, max 100), offset (default 0)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireSuperadminPlatform(request);
    if (!auth.user) return forbiddenResponse("Superadmin only");

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status")?.trim();
    const searchRaw = searchParams.get("search")?.trim() ?? "";
    const search = searchRaw.toLowerCase();
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "40", 10) || 40));
    const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10) || 0);

    const admin = getSupabaseAdmin();

    /** Avoid LIKE wildcards in user input */
    const safeLike = searchRaw.replace(/[%_]/g, "");

    let providerIdsFromSearch: string[] = [];
    if (search) {
      const { data: provs, error: pSearchErr } = await admin
        .from("providers")
        .select("id")
        .or(`business_name.ilike.%${search}%,owner_name.ilike.%${search}%`);
      if (pSearchErr) throw pSearchErr;
      providerIdsFromSearch = (provs ?? []).map((p) => (p as { id: string }).id);
    }

    const selectCols =
      "id, provider_id, status, budget, spent, bid_cpc, daily_budget, pack_impressions, billing_model, duration_days, start_at, end_at, created_at, updated_at";

    let listQuery = admin.from("ads_campaigns").select(selectCols).order("updated_at", { ascending: false });

    if (status && ["draft", "active", "paused", "ended"].includes(status)) {
      listQuery = listQuery.eq("status", status);
    }

    if (search) {
      if (providerIdsFromSearch.length > 0) {
        listQuery = listQuery.or(
          `id.ilike.%${safeLike}%,provider_id.in.(${providerIdsFromSearch.join(",")})`
        );
      } else {
        listQuery = listQuery.ilike("id", `%${safeLike}%`);
      }
    }

    listQuery = listQuery.range(offset, offset + limit - 1);

    const { data: rows, error } = await listQuery;
    if (error) throw error;

    type Row = {
      id: string;
      provider_id: string;
      status: string;
      budget: number;
      spent: number;
      bid_cpc: number;
      daily_budget: number | null;
      pack_impressions: number | null;
      billing_model: string | null;
      duration_days: number | null;
      start_at: string | null;
      end_at: string | null;
      created_at: string;
      updated_at: string;
    };

    const listRaw = (rows ?? []) as Row[];
    const providerIds = [...new Set(listRaw.map((r) => r.provider_id))];
    const providerNameById = new Map<string, string>();
    if (providerIds.length > 0) {
      const { data: provs, error: pErr } = await admin
        .from("providers")
        .select("id, business_name, user_id, users:user_id(full_name)")
        .in("id", providerIds);
      if (pErr) throw pErr;
      for (const p of provs ?? []) {
        const pr = p as {
          id: string;
          business_name?: string | null;
          users?:
            | { full_name?: string | null }
            | Array<{ full_name?: string | null }>
            | null;
        };
        const userRow = Array.isArray(pr.users) ? pr.users[0] : pr.users;
        providerNameById.set(
          pr.id,
          pr.business_name?.trim() || userRow?.full_name?.trim() || "Provider"
        );
      }
    }

    let countQuery = admin.from("ads_campaigns").select("*", { count: "exact", head: true });
    if (status && ["draft", "active", "paused", "ended"].includes(status)) {
      countQuery = countQuery.eq("status", status);
    }
    if (search) {
      if (providerIdsFromSearch.length > 0) {
        countQuery = countQuery.or(
          `id.ilike.%${safeLike}%,provider_id.in.(${providerIdsFromSearch.join(",")})`
        );
      } else {
        countQuery = countQuery.ilike("id", `%${safeLike}%`);
      }
    }
    const { count } = await countQuery;

    return successResponse({
      campaigns: listRaw.map((r) => ({
        id: r.id,
        provider_id: r.provider_id,
        provider_name: providerNameById.get(r.provider_id) ?? "Provider",
        status: r.status,
        billing_model: r.billing_model ?? "cpc_budget",
        budget: Number(r.budget),
        spent: Number(r.spent),
        bid_cpc: Number(r.bid_cpc),
        daily_budget: r.daily_budget != null ? Number(r.daily_budget) : null,
        pack_impressions: r.pack_impressions != null ? Number(r.pack_impressions) : null,
        duration_days: r.duration_days != null ? Number(r.duration_days) : null,
        start_at: r.start_at,
        end_at: r.end_at,
        created_at: r.created_at,
        updated_at: r.updated_at,
      })),
      total: count ?? listRaw.length,
      limit,
      offset,
    });
  } catch (error) {
    return handleApiError(error as Error, "Failed to list ads campaigns");
  }
}
