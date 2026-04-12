import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, errorResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { enforcePeriodLock } from "@/lib/finance/period-lock";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

const createAdjustmentSchema = z.object({
  amount: z.number(),
  description: z.string().min(3),
  effective_at: z.string().datetime().optional(),
  adjustment_code: z.string().min(2).max(64).optional(),
});

/**
 * GET /api/admin/finance/adjustments
 * Returns recent manual finance adjustments for close reviews.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const { searchParams } = new URL(request.url);
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));

    const { data, error } = await supabase
      .from("finance_transactions")
      .select("id, amount, net, description, metadata, created_at, provider_id, booking_id")
      .eq("tenant_id", tenantId)
      .eq("transaction_type", "manual_adjustment")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;

    return successResponse({ adjustments: data ?? [], limit });
  } catch (error) {
    return handleApiError(error, "Failed to fetch finance adjustments");
  }
}

/**
 * POST /api/admin/finance/adjustments
 * Creates a controlled manual adjustment entry in finance ledger.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const payload = createAdjustmentSchema.safeParse(await request.json());
    if (!payload.success) {
      return errorResponse("Invalid adjustment payload", "VALIDATION_ERROR", 400);
    }

    const effectiveAt = payload.data.effective_at ?? new Date().toISOString();
    const guard = await enforcePeriodLock(supabase, tenantId, effectiveAt);
    if (guard) return guard;

    const amount = Number(payload.data.amount);
    const description = payload.data.description.trim();
    const adjustmentCode = payload.data.adjustment_code?.trim() || "MANUAL_ADJUSTMENT";

    const { data, error } = await supabase
      .from("finance_transactions")
      .insert({
        tenant_id: tenantId,
        transaction_type: "manual_adjustment",
        amount,
        net: amount,
        fees: 0,
        commission: 0,
        description,
        created_at: effectiveAt,
        metadata: {
          adjustment_code: adjustmentCode,
          created_by: user.id,
          source: "admin_finance_adjustment",
        },
      })
      .select("id, amount, net, description, created_at, metadata")
      .single();
    if (error) throw error;

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "finance.adjustment.create",
      entity_type: "finance_transaction",
      entity_id: data.id,
      module: "finance",
      risk_level: "high",
      retention_tier: "financial",
      metadata: {
        amount,
        description,
        effective_at: effectiveAt,
        adjustment_code: adjustmentCode,
      },
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    return successResponse({ adjustment: data });
  } catch (error) {
    return handleApiError(error, "Failed to create finance adjustment");
  }
}

