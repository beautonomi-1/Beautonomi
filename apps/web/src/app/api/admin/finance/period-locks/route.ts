import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, errorResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { unauthorizedResponse } from "@/lib/auth/requireRole";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog } from "@/lib/audit/audit";

const createLockSchema = z.object({
  period_start: z.string().min(10), // ISO date
  period_end: z.string().min(10),
  notes: z.string().optional().nullable(),
});

/**
 * GET /api/admin/finance/period-locks
 * List all financial period locks for this tenant.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    if (!user) return unauthorizedResponse("Authentication required");

    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const { data, error } = await (supabase.from("financial_period_locks") as any)
      .select("id, period_start, period_end, locked_at, locked_by, notes, created_at")
      .eq("tenant_id", tenantId)
      .order("period_end", { ascending: false });

    if (error) {
      // Table not yet created — return empty list with migration hint
      if (error.code === "42P01" || String(error.message).includes("does not exist")) {
        return successResponse({
          locks: [],
          migration_required: true,
          message:
            "The financial_period_locks table does not exist yet. Run the migration in supabase/migrations to enable period locking.",
        });
      }
      throw error;
    }

    // Enrich with locked_by user name
    const userIds = [...new Set((data ?? []).map((r: any) => r.locked_by).filter(Boolean))];
    let userMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from("users")
        .select("id, full_name")
        .in("id", userIds as string[]);
      userMap = Object.fromEntries((users ?? []).map((u: any) => [u.id, u.full_name ?? u.id]));
    }

    const locks = (data ?? []).map((r: any) => ({
      ...r,
      locked_by_name: userMap[r.locked_by] ?? r.locked_by ?? null,
    }));

    return successResponse({ locks });
  } catch (error) {
    return handleApiError(error, "Failed to fetch period locks");
  }
}

/**
 * POST /api/admin/finance/period-locks
 * Create a new financial period lock. Only superadmin can lock periods.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    if (!user) return unauthorizedResponse("Authentication required");

    // Period locks are a destructive financial control — require superadmin or admin_finance
    const privilegedRoles = ["superadmin", "admin_finance", "admin_platform_config"] as const;
    if (!privilegedRoles.includes(user.role as typeof privilegedRoles[number])) {
      return errorResponse("Only superadmin, admin_finance, or admin_platform_config can lock financial periods.", "FORBIDDEN", 403);
    }

    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const body = await request.json();

    const parsed = createLockSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("Validation failed: " + parsed.error.issues.map((i) => i.message).join(", "), "VALIDATION_ERROR", 400);
    }

    const { period_start, period_end, notes } = parsed.data;

    if (period_end < period_start) {
      return errorResponse("period_end must be on or after period_start.", "VALIDATION_ERROR", 400);
    }

    // Check for overlapping locks
    const { data: existing } = await (supabase.from("financial_period_locks") as any)
      .select("id, period_start, period_end")
      .eq("tenant_id", tenantId)
      .lte("period_start", period_end)
      .gte("period_end", period_start)
      .limit(1)
      .maybeSingle();

    if (existing) {
      return errorResponse(
        `A period lock already exists that overlaps with ${period_start} – ${period_end} (existing: ${existing.period_start} – ${existing.period_end}).`,
        "LOCK_OVERLAP",
        409
      );
    }

    const { data: newLock, error } = await (supabase.from("financial_period_locks") as any)
      .insert({
        tenant_id: tenantId,
        period_start,
        period_end,
        locked_at: new Date().toISOString(),
        locked_by: user.id,
        notes: notes ?? null,
      })
      .select()
      .single();

    if (error) throw error;

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "admin",
      action: "finance.period_lock.create",
      entity_type: "financial_period_locks",
      entity_id: newLock.id,
      metadata: { period_start, period_end, notes, tenant_id: tenantId },
    });

    return successResponse(newLock);
  } catch (error) {
    return handleApiError(error, "Failed to create period lock");
  }
}
