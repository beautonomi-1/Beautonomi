import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import { requireOpsManagers } from "@/lib/provider-ops/ops-desk-auth";
import type { OpsDesk } from "@/lib/provider-ops/ops-desk-roles";

const VALID_METRICS = [
  "leads_contacted",
  "leads_won",
  "providers_activated",
  "first_bookings",
  "at_risk_saves",
] as const;

const VALID_DESKS: OpsDesk[] = ["sales", "onboarding", "retention"];

function monthStartIso(d = new Date()): string {
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  return start.toISOString().slice(0, 10);
}

/**
 * GET /api/admin/provider-ops/quotas?period_start=YYYY-MM-DD
 */
export async function GET(request: NextRequest) {
  try {
    await requireOpsManagers(request);
    const tenantId = await resolveAdminApiTenantId(request);
    const { searchParams } = new URL(request.url);
    const periodStart = searchParams.get("period_start")?.trim() || monthStartIso();

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("provider_ops_quotas")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("period_start", periodStart)
      .order("desk", { ascending: true });
    if (error) throw error;

    return successResponse({ period_start: periodStart, quotas: data ?? [] });
  } catch (error) {
    return handleApiError(error, "Failed to load quotas");
  }
}

/**
 * PATCH /api/admin/provider-ops/quotas
 * Body: { period_start?, quotas: [{ user_id, desk, metric, target }] }
 */
export async function PATCH(request: NextRequest) {
  try {
    const { user } = await requireOpsManagers(request);
    const tenantId = await resolveAdminApiTenantId(request);
    const body = await request.json();
    const periodStart =
      typeof body.period_start === "string" && body.period_start.trim()
        ? body.period_start.trim()
        : monthStartIso();

    const rows = Array.isArray(body.quotas) ? body.quotas : [];
    if (rows.length === 0) {
      return errorResponse("quotas array is required", "VALIDATION_ERROR", 400);
    }

    const supabase = getSupabaseAdmin();
    const upserts: Record<string, unknown>[] = [];

    for (const row of rows) {
      const userId = typeof row.user_id === "string" ? row.user_id : "";
      const desk = row.desk as OpsDesk;
      const metric = row.metric as string;
      const target = Number(row.target);
      if (!userId || !VALID_DESKS.includes(desk) || !VALID_METRICS.includes(metric as (typeof VALID_METRICS)[number])) {
        return errorResponse("Invalid quota row", "VALIDATION_ERROR", 400);
      }
      if (!Number.isFinite(target) || target < 0) {
        return errorResponse("target must be a non-negative number", "VALIDATION_ERROR", 400);
      }
      upserts.push({
        tenant_id: tenantId,
        user_id: userId,
        desk,
        period_start: periodStart,
        metric,
        target: Math.round(target),
        updated_at: new Date().toISOString(),
      });
    }

    const { error } = await supabase.from("provider_ops_quotas").upsert(upserts, {
      onConflict: "tenant_id,user_id,desk,period_start,metric",
    });
    if (error) throw error;

    void writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "admin.provider_ops.quotas.update",
      entity_type: "provider_ops_quotas",
      module: "provider_ops",
      risk_level: "medium",
      retention_tier: "operational",
      metadata: { period_start: periodStart, count: upserts.length },
      ...extractRequestMeta(request),
    });

    const { data } = await supabase
      .from("provider_ops_quotas")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("period_start", periodStart);

    return successResponse({ period_start: periodStart, quotas: data ?? [] });
  } catch (error) {
    return handleApiError(error, "Failed to update quotas");
  }
}
