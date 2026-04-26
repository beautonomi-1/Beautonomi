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

const patchSchema = z.object({
  plan_id: z.string().uuid().optional(),
  status: z
    .enum(["active", "cancelled", "expired", "past_due", "trialing", "inactive"])
    .optional(),
  billing_period: z.enum(["monthly", "yearly"]).optional().nullable(),
  auto_renew: z.boolean().optional(),
});

/**
 * PATCH /api/admin/provider-subscriptions/[id]
 * Superadmin override: change a provider's subscription tier or status.
 * When `plan_id` changes and a Paystack subscription exists, disables it on Paystack (same pattern as
 * provider cancel) so billing does not continue at the old rate; see `paystack_sync_pending` / `paystack_sync_note`.
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

    const { plan_id, status, billing_period, auto_renew } = parsed.data;
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
      .select("id, plan_id, paystack_subscription_code, tenant_id, provider_id")
      .eq("id", id)
      .maybeSingle();

    if (existingErr) throw existingErr;
    if (!existing) {
      return errorResponse("Provider subscription not found", "NOT_FOUND", 404);
    }

    const { data: providerRow, error: provErr } = await supabase
      .from("providers")
      .select("id, tenant_id")
      .eq("id", (existing as { provider_id?: string }).provider_id ?? "")
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

    if (plan_id) {
      const allowedIds = await getMergedSubscriptionPlanIdsForTenant(providerTenantId);
      if (!allowedIds.has(String(plan_id))) {
        return errorResponse(
          "Subscription plan is not available for this provider's tenant (merge global + tenant catalog)",
          "VALIDATION_ERROR",
          400,
        );
      }
    }

    const planChanging =
      plan_id !== undefined && String(plan_id) !== String((existing as { plan_id?: string }).plan_id ?? "");

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (plan_id !== undefined) update.plan_id = plan_id;
    if (status !== undefined) update.status = status;
    if (billing_period !== undefined) update.billing_period = billing_period;
    if (auto_renew !== undefined) update.auto_renew = auto_renew;

    if (planChanging) {
      const paystackCode = (existing as { paystack_subscription_code?: string | null })
        .paystack_subscription_code;
      if (paystackCode) {
        const tenantId = await resolveTenantIdForFinanceLedger(supabase, {
          tenant_id: (existing as { tenant_id?: string | null }).tenant_id ?? null,
          provider_id: (existing as { provider_id?: string | null }).provider_id ?? null,
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
      } else {
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
