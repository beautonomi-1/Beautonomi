import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";

/**
 * GET /api/admin/notifications/logs
 * 
 * Get notification logs with filters
 */
export async function GET(request: Request) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer(request);
    const { searchParams } = new URL(request.url);

    const eventType = searchParams.get("event_type");
    const status = searchParams.get("status");
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = (page - 1) * limit;

    let query = supabase
      .from("notification_logs")
      .select("*", { count: "exact" });

    // Apply filters
    if (eventType) {
      query = query.eq("event_type", eventType);
    }
    if (status) {
      query = query.eq("status", status);
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
      console.error("Error fetching notification logs:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to fetch notification logs",
            code: "FETCH_ERROR",
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: logs || [],
      error: null,
      meta: {
        page,
        limit,
        total: count || 0,
        has_more: (count || 0) > offset + limit,
      },
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/notifications/logs:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to fetch notification logs",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

