import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection } from "@/lib/supabase/api-helpers";
import { unauthorizedResponse } from "@/lib/auth/requireRole";
import { arrayToCSV, generateCSVFilename } from "@/lib/utils/csv";
import { checkRateLimit } from "@/lib/rate-limit";
import { ADMIN_SECTION_USERS_TRUST } from "@/lib/admin-sections";

/**
 * GET /api/admin/export/users
 * 
 * Export users as CSV (rate limited)
 */
export async function GET(request: Request) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_USERS_TRUST, request);
    if (!user) {
      return unauthorizedResponse("Authentication required");
    }

    const { allowed, retryAfter } = checkRateLimit(user.id, "export:users");
    if (!allowed) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
            code: "RATE_LIMIT_EXCEEDED",
          },
        },
        {
          status: 429,
          headers: retryAfter
            ? { "Retry-After": String(retryAfter) }
            : undefined,
        }
      );
    }

    const supabase = await getSupabaseServer(request);
    const { searchParams } = new URL(request.url);

    const role = searchParams.get("role");
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");

    let query = supabase
      .from("users")
      .select("id, email, full_name, role, created_at, last_login");

    // Apply filters
    if (role) {
      query = query.eq("role", role);
    }
    if (startDate) {
      query = query.gte("created_at", startDate);
    }
    if (endDate) {
      query = query.lte("created_at", endDate);
    }

    const { data: users, error } = await query.order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching users:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to fetch users",
            code: "FETCH_ERROR",
          },
        },
        { status: 500 }
      );
    }

    // Transform data for CSV
    type UserRow = { id: string; email?: string; full_name?: string; role: string; created_at?: string; last_login?: string };
    const csvData = (users || []).map((user: UserRow) => ({
      "User ID": user.id,
      "Email": user.email ?? "",
      "Full Name": user.full_name ?? "",
      "Role": user.role,
      "Created At": user.created_at ?? "",
      "Last Login": user.last_login ?? "",
    }));

    const csv = arrayToCSV(csvData);
    const filename = generateCSVFilename("users-export");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/export/users:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to export users",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

