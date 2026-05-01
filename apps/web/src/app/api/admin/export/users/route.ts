import { NextResponse } from "next/server";
import { requireAdminSection } from "@/lib/supabase/api-helpers";
import { unauthorizedResponse } from "@/lib/auth/requireRole";
import { arrayToCSV, generateCSVFilename } from "@/lib/utils/csv";
import { checkRateLimit } from "@/lib/rate-limit";
import { ADMIN_SECTION_USERS_TRUST } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/admin/export/users
 *
 * Export users as CSV (rate limited). Rows are limited to admin tenant scope (same as user directory).
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

    const tenantId = await resolveAdminApiTenantId(request);
    const { searchParams } = new URL(request.url);

    const roleParam = searchParams.get("role");
    const roleFilter =
      roleParam && roleParam.trim() !== "" && roleParam.toLowerCase() !== "all"
        ? roleParam.trim()
        : null;

    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");

    const admin = getSupabaseAdmin();
    const { data: scopedUsers, error: rpcErr } = await admin.rpc("admin_users_in_tenant_scope", {
      p_tenant_id: tenantId,
      p_role: roleFilter,
    });

    if (rpcErr) {
      console.error("admin_users_in_tenant_scope (export users):", rpcErr);
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

    type UserRow = {
      id: string;
      email?: string | null;
      full_name?: string | null;
      role?: string | null;
      created_at?: string | null;
      last_login?: string | null;
    };

    let rows = ((scopedUsers ?? []) as UserRow[]).map((u) => ({
      id: u.id,
      email: u.email ?? "",
      full_name: u.full_name ?? "",
      role: u.role ?? "",
      created_at: u.created_at ?? "",
      last_login: u.last_login ?? "",
    }));

    if (startDate) {
      const s = new Date(`${startDate}T00:00:00.000Z`).getTime();
      rows = rows.filter((u) => {
        if (!u.created_at) return false;
        return new Date(u.created_at).getTime() >= s;
      });
    }
    if (endDate) {
      const e = new Date(`${endDate}T23:59:59.999Z`).getTime();
      rows = rows.filter((u) => {
        if (!u.created_at) return false;
        return new Date(u.created_at).getTime() <= e;
      });
    }

    rows.sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });

    const csvData = rows.map((u) => ({
      "User ID": u.id,
      Email: u.email,
      "Full Name": u.full_name,
      Role: u.role,
      "Created At": u.created_at,
      "Last Login": u.last_login,
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
