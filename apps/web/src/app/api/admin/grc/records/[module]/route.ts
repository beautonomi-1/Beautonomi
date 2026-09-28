import { NextRequest } from "next/server";
import { getGrcModule } from "@beautonomi/admin-access";
import { handleApiError, requireGrcPermission, successResponse } from "@/lib/supabase/api-helpers";
import { writeGrcActivity } from "@/lib/grc/activity";
import { grcForbidden, grcFromDbError, grcNotFound } from "@/lib/grc/errors";
import { GRC_LIST_LIMIT, grcListColumns, parseGrcRecord } from "@/lib/grc/records";

type Ctx = { params: Promise<{ module: string }> };

function loadModule(key: string) {
  const mod = getGrcModule(key);
  if (!mod) throw grcNotFound(`Unknown GRC module "${key}"`);
  return mod;
}

export async function GET(request: NextRequest, ctx: Ctx) {
  try {
    const mod = loadModule((await ctx.params).module);
    const { supabase } = await requireGrcPermission(mod.viewPermission, request);
    const url = new URL(request.url);
    const search = (url.searchParams.get("q") ?? "").replace(/[^\p{L}\p{N}\s._:-]/gu, "").trim().slice(0, 100);
    const status = url.searchParams.get("status");
    const controlId = url.searchParams.get("control_id");
    const columns = grcListColumns(mod);

    let query = supabase
      .from(mod.table)
      .select(columns, { count: "exact" })
      .order(mod.orderBy.column, { ascending: mod.orderBy.ascending, nullsFirst: false })
      .limit(GRC_LIST_LIMIT);
    if (search && mod.searchColumns?.length) {
      query = query.or(mod.searchColumns.map((c) => `${c}.ilike.%${search}%`).join(","));
    }
    if (status && mod.statusColumn) query = query.eq(mod.statusColumn, status);
    if (controlId && columns.split(",").includes("control_id")) query = query.eq("control_id", controlId.slice(0, 40));

    const { data, error, count } = await query;
    if (error) throw grcFromDbError(error);
    return successResponse({ items: data ?? [], total: count ?? 0, truncated: (count ?? 0) > GRC_LIST_LIMIT });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const mod = loadModule((await ctx.params).module);
    if (!mod.canCreate || !mod.editPermission) throw grcForbidden(`${mod.title} records are not created from this form`);
    const { user, supabase } = await requireGrcPermission(mod.editPermission, request);
    const values = parseGrcRecord(mod, "create", await request.json().catch(() => null));

    const { data, error } = await supabase.from(mod.table).insert(values).select("*").single();
    if (error) throw grcFromDbError(error);
    const row = data as Record<string, unknown>;
    const id = String(row[mod.idColumn]);

    await writeGrcActivity({
      actor_user_id: user.id,
      action: `grc.${mod.key}.created`,
      entity_type: mod.table,
      entity_id: id,
      metadata: { fields: Object.keys(values) },
    });
    return successResponse({ item: row }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
