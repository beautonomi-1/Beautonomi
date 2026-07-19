import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_USERS_TRUST } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import {
  isValidFraudCaseTransition,
  requiresDecisionNotes,
  type FraudCaseStatus,
} from "@/lib/fraud/fraud-case-transitions";
import { notifyFraudCaseReviewStatus } from "@/lib/fraud/notify-fraud-case-review";

const patchSchema = z.object({
  status: z.enum(["review", "held", "released", "closed"]),
  decision: z.string().max(4000).optional(),
  assigned_to: z.string().uuid().optional().nullable(),
});

/**
 * GET /api/admin/fraud-cases/[id]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminSection(ADMIN_SECTION_USERS_TRUST, request);
    const tenantId = await resolveAdminApiTenantId(request);
    const { id } = await params;
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("fraud_cases")
      .select("*")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error || !data) {
      return errorResponse("Fraud case not found", "NOT_FOUND", 404);
    }

    type Row = typeof data & {
      subject_user_id?: string | null;
      subject_provider_id?: string | null;
      assigned_to?: string | null;
    };
    const row = data as Row;
    const userIds = [
      row.subject_user_id,
      row.assigned_to,
    ].filter(Boolean) as string[];

    let userMap: Record<string, { id: string; full_name: string | null; email: string }> = {};
    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from("users")
        .select("id, full_name, email")
        .in("id", userIds);
      userMap = (users ?? []).reduce(
        (acc, u) => {
          acc[u.id] = u;
          return acc;
        },
        {} as typeof userMap,
      );
    }

    let provider: { id: string; business_name: string | null } | null = null;
    if (row.subject_provider_id) {
      const { data: p } = await supabase
        .from("providers")
        .select("id, business_name")
        .eq("id", row.subject_provider_id)
        .maybeSingle();
      provider = p as typeof provider;
    }

    return successResponse({
      ...row,
      subject_user: row.subject_user_id ? userMap[row.subject_user_id] ?? null : null,
      assigned_user: row.assigned_to ? userMap[row.assigned_to] ?? null : null,
      subject_provider: provider,
    });
  } catch (error) {
    return handleApiError(error as Error, "Failed to fetch fraud case");
  }
}

/**
 * PATCH /api/admin/fraud-cases/[id]
 * Human Trust disposition only.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_USERS_TRUST, request);
    const tenantId = await resolveAdminApiTenantId(request);
    const { id } = await params;
    const body = patchSchema.parse(await request.json());
    const supabase = getSupabaseAdmin();

    const { data: existing, error: fetchError } = await supabase
      .from("fraud_cases")
      .select("*")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (fetchError || !existing) {
      return errorResponse("Fraud case not found", "NOT_FOUND", 404);
    }

    const currentStatus = existing.status as FraudCaseStatus;
    const nextStatus = body.status as FraudCaseStatus;

    if (!isValidFraudCaseTransition(currentStatus, nextStatus)) {
      return errorResponse(
        `Invalid status transition: ${currentStatus} → ${nextStatus}`,
        "VALIDATION_ERROR",
        400,
      );
    }

    const decisionNotes = body.decision?.trim() ?? "";
    if (requiresDecisionNotes(nextStatus) && !decisionNotes) {
      return errorResponse("decision notes are required for this status", "VALIDATION_ERROR", 400);
    }

    const patch: Record<string, unknown> = {
      status: nextStatus,
      updated_at: new Date().toISOString(),
    };
    if (decisionNotes) patch.decision = decisionNotes;
    if (body.assigned_to !== undefined) {
      patch.assigned_to = body.assigned_to;
    } else if (!existing.assigned_to) {
      patch.assigned_to = user.id;
    }

    const { data: updated, error } = await supabase
      .from("fraud_cases")
      .update(patch)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select("*")
      .single();

    if (error) return handleApiError(error, "Failed to update fraud case");

    if (nextStatus === "held" || nextStatus === "released" || nextStatus === "closed") {
      try {
        await notifyFraudCaseReviewStatus({
          subjectUserId: (existing as { subject_user_id?: string }).subject_user_id,
          subjectProviderId: (existing as { subject_provider_id?: string }).subject_provider_id,
          status: nextStatus,
          previousStatus: currentStatus,
        });
      } catch (notifyErr) {
        console.warn("[fraud-cases PATCH] user notification failed:", notifyErr);
      }
    }

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "admin.fraud_case.update",
      entity_type: "fraud_case",
      entity_id: id,
      module: "users_trust",
      risk_level: "high",
      retention_tier: "operational",
      metadata: { from: currentStatus, to: nextStatus },
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(
        new Error(error.issues.map((e) => e.message).join(", ")),
        "Validation failed",
        "VALIDATION_ERROR",
        400,
      );
    }
    return handleApiError(error as Error, "Failed to update fraud case");
  }
}
