import { NextRequest } from "next/server";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { z } from "zod";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import { disableSubscriptionByCode } from "@/lib/payments/paystack-complete";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { getMergedSubscriptionPlanIdsForTenant } from "@/lib/subscription/admin-merged-plan-ids";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { computeTrialEndsAt, DEFAULT_PROVIDER_TRIAL_DAYS } from "@/lib/subscriptions/trial";

const patchSchema = z.object({
  plan_id: z.string().uuid().optional(),
  status: z
    .enum(["active", "cancelled", "expired", "past_due", "trialing", "inactive"])
    .optional(),
  billing_period: z.enum(["monthly", "yearly"]).optional().nullable(),
  auto_renew: z.boolean().optional(),
  trial_days: z.number().int().min(1).max(90).optional(),
});

type PlanRow = {
  id: string;
  is_free?: boolean | null;
  price_monthly?: number | null;
  price_yearly?: number | null;
};

function planIsFree(plan: PlanRow | null | undefined): boolean {
  if (!plan) return false;
  if (plan.is_free === true) return true;
  const monthly = Number(plan.price_monthly ?? 0);
  const yearly = Number(plan.price_yearly ?? 0);
  return monthly <= 0 && yearly <= 0;
}

function applyFreeTierClears(update: Record<string, unknown>): void {
  update.expires_at = null;
  update.auto_renew = false;
  update.paystack_subscription_code = null;
  update.next_payment_date = null;
  update.paystack_sync_pending = false;
  update.paystack_sync_note = null;
}

function applyReactivationClears(update: Record<string, unknown>): void {
  update.cancelled_at = null;
  update.status = "active";
}

/**
 * PATCH /api/admin/provider-subscriptions/[id]
 * Superadmin override: change a provider's subscription tier or status.
 * Assigning a plan or reactivating clears cancellation fields and sets status active.
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

    const { plan_id, status, billing_period, auto_renew, trial_days } = parsed.data;
    if (
      plan_id === undefined &&
      status === undefined &&
      billing_period === undefined &&
      auto_renew === undefined
    ) {
      return errorResponse("Nothing to update", "VALIDATION_ERROR", 400);
    }

    const supabase = getSupabaseAdmin();
    const role = String(admin.role ?? "").toLowerCase();
    const isSuperadmin = role === "superadmin";
    const isPlatformConfig = role === "admin_platform_config";
    const canCrossTenant = isSuperadmin || isPlatformConfig;
    const currentHostTenantId = await resolveAdminApiTenantId(request);

    const { data: existing, error: existingErr } = await supabase
      .from("provider_subscriptions")
      .select(
        "id, plan_id, status, expires_at, cancelled_at, paystack_subscription_code, tenant_id, provider_id",
      )
      .eq("id", id)
      .maybeSingle();

    if (existingErr) throw existingErr;
    if (!existing) {
      return errorResponse("Provider subscription not found", "NOT_FOUND", 404);
    }

    const existingRow = existing as {
      plan_id?: string | null;
      status?: string | null;
      expires_at?: string | null;
      paystack_subscription_code?: string | null;
      tenant_id?: string | null;
      provider_id?: string | null;
    };

    const { data: providerRow, error: provErr } = await supabase
      .from("providers")
      .select("id, tenant_id")
      .eq("id", existingRow.provider_id ?? "")
      .maybeSingle();
    if (provErr) throw provErr;
    const providerTenantId = (providerRow as { tenant_id?: string | null } | null)?.tenant_id ?? null;

    if (!canCrossTenant) {
      if (!providerRow || String(providerTenantId ?? "") !== String(currentHostTenantId ?? "")) {
        return errorResponse(
          "This subscription belongs to another tenant",
          "FORBIDDEN",
          403,
        );
      }
    }

    const { data: currentPlan } = await supabase
      .from("subscription_plans")
      .select("id, is_free, price_monthly, price_yearly")
      .eq("id", existingRow.plan_id ?? "")
      .maybeSingle();

    let targetPlan: PlanRow | null = null;
    if (plan_id) {
      const allowedIds = await getMergedSubscriptionPlanIdsForTenant(providerTenantId);
      if (!allowedIds.has(String(plan_id))) {
        return errorResponse(
          "Subscription plan is not available for this provider's tenant (merge global + tenant catalog)",
          "VALIDATION_ERROR",
          400,
        );
      }
      const { data: tp } = await supabase
        .from("subscription_plans")
        .select("id, is_free, price_monthly, price_yearly")
        .eq("id", plan_id)
        .maybeSingle();
      targetPlan = tp as PlanRow | null;
      if (!targetPlan) {
        return errorResponse("Subscription plan not found", "NOT_FOUND", 404);
      }
    }

    const effectivePlan = targetPlan ?? (currentPlan as PlanRow | null);
    const planChanging =
      plan_id !== undefined && String(plan_id) !== String(existingRow.plan_id ?? "");

    if (status === "cancelled" && planIsFree(effectivePlan)) {
      return errorResponse(
        "Free subscriptions cannot be cancelled here. Change plan, reactivate, or suspend the provider account to restrict access.",
        "VALIDATION_ERROR",
        400,
      );
    }

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (plan_id !== undefined) update.plan_id = plan_id;
    if (billing_period !== undefined) update.billing_period = billing_period;
    if (auto_renew !== undefined) update.auto_renew = auto_renew;

    if (plan_id !== undefined) {
      applyReactivationClears(update);
      if (planIsFree(targetPlan)) {
        applyFreeTierClears(update);
      }
    }

    if (status === "active") {
      applyReactivationClears(update);
      if (planIsFree(effectivePlan)) {
        applyFreeTierClears(update);
      }
    }

    if (status === "cancelled") {
      const now = new Date();
      const expiresAt = existingRow.expires_at ? new Date(existingRow.expires_at) : null;
      const periodStillActive =
        expiresAt != null && Number.isFinite(expiresAt.getTime()) && expiresAt > now;

      update.cancelled_at = now.toISOString();
      update.auto_renew = false;

      if (periodStillActive) {
        update.status = "active";
      } else {
        update.status = "cancelled";
      }

      const paystackCode = existingRow.paystack_subscription_code;
      if (paystackCode) {
        const tenantId = await resolveTenantIdForFinanceLedger(supabase, {
          tenant_id: existingRow.tenant_id ?? null,
          provider_id: existingRow.provider_id ?? null,
        });
        try {
          await disableSubscriptionByCode(paystackCode, { tenantId });
          update.paystack_subscription_code = null;
          update.next_payment_date = null;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("[admin provider-subscriptions] Paystack disable on cancel failed:", e);
          update.paystack_sync_pending = true;
          update.paystack_sync_note = `Paystack disable failed (${msg}). Cancel manually in Paystack if needed.`;
        }
      }
    } else if (status !== undefined && status !== "active") {
      update.status = status;
      if (status === "trialing") {
        update.trial_ends_at = computeTrialEndsAt(
          new Date(),
          trial_days ?? DEFAULT_PROVIDER_TRIAL_DAYS,
        );
      }
    }

    if (planChanging) {
      const paystackCode = existingRow.paystack_subscription_code;
      if (paystackCode) {
        const tenantId = await resolveTenantIdForFinanceLedger(supabase, {
          tenant_id: existingRow.tenant_id ?? null,
          provider_id: existingRow.provider_id ?? null,
        });
        try {
          await disableSubscriptionByCode(paystackCode, { tenantId });
          update.paystack_subscription_code = null;
          update.next_payment_date = null;
          update.paystack_sync_pending = true;
          update.paystack_sync_note =
            "Paystack subscription was cancelled because an admin changed the plan. If the new tier is paid, the provider should complete billing in the app.";
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("[admin provider-subscriptions] Paystack disable failed:", e);
          update.paystack_sync_pending = true;
          update.paystack_sync_note = `Paystack disable failed (${msg}). Cancel the subscription in the Paystack dashboard or retry.`;
        }
      } else if (!planIsFree(targetPlan)) {
        update.paystack_sync_pending = false;
        update.paystack_sync_note = null;
      }
    }

    const { data: row, error } = await supabase
      .from("provider_subscriptions")
      .update(update)
      .eq("id", id)
      .select(
        `
        *,
        providers:provider_id ( id, business_name, slug ),
        subscription_plans:plan_id ( id, name, price_monthly, price_yearly, is_free )
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
      after_json: {
        plan_id,
        status,
        billing_period,
        auto_renew,
        paystack_sync_pending: update.paystack_sync_pending,
        paystack_sync_note: update.paystack_sync_note,
      },
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
      superadmin_bypass_used: admin.role === "superadmin",
    });

    return successResponse(row);
  } catch (error) {
    return handleApiError(error, "Failed to update provider subscription");
  }
}
