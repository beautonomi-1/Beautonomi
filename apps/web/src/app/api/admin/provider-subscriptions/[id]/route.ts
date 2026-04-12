import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { z } from "zod";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

const patchSchema = z.object({
  plan_id: z.string().uuid().optional(),
  status: z.enum(["active", "cancelled", "expired", "past_due"]).optional(),
  billing_period: z.enum(["monthly", "yearly"]).optional().nullable(),
});

/**
 * PATCH /api/admin/provider-subscriptions/[id]
 * Superadmin override: change a provider's subscription tier or status.
 * Does not call Paystack — gateway may need a separate alignment for billed customers.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user: admin } = await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const { id } = await params;
    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("Invalid body", "VALIDATION_ERROR", 400, parsed.error.issues);
    }

    const { plan_id, status, billing_period } = parsed.data;
    if (plan_id === undefined && status === undefined && billing_period === undefined) {
      return errorResponse("Nothing to update", "VALIDATION_ERROR", 400);
    }

    const supabase = await getSupabaseServer(request);

    if (plan_id) {
      const { data: plan, error: pErr } = await supabase
        .from("subscription_plans")
        .select("id")
        .eq("id", plan_id)
        .maybeSingle();
      if (pErr) throw pErr;
      if (!plan) {
        return errorResponse("Subscription plan not found", "NOT_FOUND", 404);
      }
    }

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (plan_id !== undefined) update.plan_id = plan_id;
    if (status !== undefined) update.status = status;
    if (billing_period !== undefined) update.billing_period = billing_period;

    const { data: row, error } = await supabase
      .from("provider_subscriptions")
      .update(update)
      .eq("id", id)
      .select(
        `
        *,
        providers:provider_id ( id, business_name, slug ),
        subscription_plans:plan_id ( id, name, price_monthly, price_yearly )
      `,
      )
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return errorResponse("Provider subscription not found", "NOT_FOUND", 404);
      }
      throw error;
    }

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: admin.id,
      actor_role: admin.role,
      action: "admin.provider_subscription.update",
      entity_type: "provider_subscription",
      entity_id: id,
      module: "finance",
      risk_level: "critical",
      retention_tier: "financial",
      status: "succeeded",
      after_json: { plan_id, status, billing_period },
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
      superadmin_bypass_used: admin.role === "superadmin",
    });

    return successResponse(row);
  } catch (error) {
    return handleApiError(error, "Failed to update provider subscription");
  }
}
