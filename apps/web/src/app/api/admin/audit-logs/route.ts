import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  handleApiError,
  getPaginationParams,
} from "@/lib/supabase/api-helpers";

/**
 * GET /api/admin/audit-logs
 * 
 * Get audit logs with filters and search
 */
export async function GET(request: Request) {
  try {
    await requireRoleInApi(["superadmin"]);
    const supabase = await getSupabaseServer();
    
    // Validate request URL
    if (!request.url) {
      return handleApiError(new Error("Invalid request URL"), "Invalid request URL");
    }
    
    let url: URL;
    try {
      url = new URL(request.url);
    } catch (error) {
      return handleApiError(error, "Invalid URL");
    }
    
    const { searchParams } = url;

    const search = searchParams.get("search");
    const action = searchParams.get("action");
    const entityType = searchParams.get("entity_type");
    const actorUserId = searchParams.get("actor_user_id");
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");
    const { page, limit, offset } = getPaginationParams(request);

    let query = supabase
      .from("audit_logs")
      .select(`
        *,
        actor:users!audit_logs_actor_user_id_fkey(id, full_name, email)
      `, { count: "exact" });

    // Apply filters
    if (search) {
      const searchPattern = `%${search}%`;
      query = query.or(
        `action.ilike.${searchPattern},entity_type.ilike.${searchPattern},actor_role.ilike.${searchPattern}`
      );
    }
    if (action) {
      query = query.eq("action", action);
    }
    if (entityType) {
      query = query.eq("entity_type", entityType);
    }
    if (actorUserId) {
      query = query.eq("actor_user_id", actorUserId);
    }
    if (startDate) {
      query = query.gte("created_at", startDate);
    }
    if (endDate) {
      query = query.lte("created_at", endDate);
    }

    // Apply pagination
    const { data: logs, error, count } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return handleApiError(error, "Failed to fetch audit logs");
    }

    // Transform logs to include actor information
    const transformedLogs = (logs || []).map((log: any) => ({
      ...log,
      actor: log.actor ? {
        id: log.actor.id,
        full_name: log.actor.full_name,
        email: log.actor.email,
      } : null,
    }));

    // Return response in format expected by frontend
    return NextResponse.json({
      data: transformedLogs,
      error: null,
      meta: {
        page,
        limit,
        total: count || 0,
        has_more: (count || 0) > page * limit,
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch audit logs");
  }
}

