import { NextRequest } from "next/server";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

/**
 * POST /api/admin/provider-subscriptions/[id]/activate
 * Activate a pending or paystack_sync_pending subscription after payment verified.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user: admin } = await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const comped = body?.comped === true;

    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const role = String(admin.role ?? "").toLowerCase();
    const canCrossTenant = role === "superadmin" || role === "admin_platform_config";

    const { data: sub, error: subErr } = await supabase
      .from("provider_subscriptions")
      .select(
        "id, provider_id, plan_id, status, paystack_sync_pending, billing_period, tenant_id, subscription_plans:plan_id(is_free, price_monthly, price_yearly)",
      )
      .eq("id", id)
      .maybeSingle();

    if (subErr) throw subErr;
    if (!sub) {
      return errorResponse("Provider subscription not found", "NOT_FOUND", 404);
    }

    const row = sub as {
      id: string;
      provider_id: string;
      plan_id: string;
      status?: string;
      paystack_sync_pending?: boolean;
      billing_period?: string;
      tenant_id?: string;
      subscription_plans?: { is_free?: boolean; price_monthly?: number; price_yearly?: number } | null;
    };

    if (!canCrossTenant && String(row.tenant_id ?? "") !== String(tenantId ?? "")) {
      return errorResponse("This subscription belongs to another tenant", "FORBIDDEN", 403);
    }

    const status = String(row.status ?? "");
    if (status !== "pending" && !row.paystack_sync_pending && status !== "inactive") {
      return errorResponse(
        "Activate is only for pending, inactive, or paystack_sync_pending subscriptions",
        "VALIDATION_ERROR",
        400,
      );
    }

    const plan = row.subscription_plans;
    const isFree =
      plan?.is_free === true ||
      (Number(plan?.price_monthly ?? 0) <= 0 && Number(plan?.price_yearly ?? 0) <= 0);

    if (!comped && !isFree) {
      const { data: ledgerPayment } = await supabase
        .from("finance_transactions")
        .select("id")
        .eq("provider_id", row.provider_id)
        .eq("transaction_type", "provider_subscription_payment")
        .contains("metadata", { plan_id: row.plan_id })
        .limit(1)
        .maybeSingle();

      const { data: paidOrder } = await supabase
        .from("provider_subscription_orders")
        .select("id")
        .eq("provider_id", row.provider_id)
        .eq("plan_id", row.plan_id)
        .eq("status", "paid")
        .limit(1)
        .maybeSingle();

      if (!ledgerPayment && !paidOrder) {
        return errorResponse(
          "No recognized subscription payment found. Pass comped: true to grant access without payment.",
          "VALIDATION_ERROR",
          400,
        );
      }
    }

    const now = new Date();
    const billingPeriod = row.billing_period === "yearly" ? "yearly" : "monthly";
    const expiresAt = new Date(now);
    if (billingPeriod === "yearly") expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    else expiresAt.setMonth(expiresAt.getMonth() + 1);

    const { data: updated, error: updateErr } = await supabase
      .from("provider_subscriptions")
      .update({
        status: "active",
        started_at: now.toISOString(),
        expires_at: isFree ? null : expiresAt.toISOString(),
        paystack_sync_pending: false,
        paystack_sync_note: null,
        cancelled_at: null,
        updated_at: now.toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (updateErr) throw updateErr;

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: admin.id,
      actor_role: admin.role,
      action: "admin.subscription.activate",
      entity_type: "provider_subscription",
      entity_id: id,
      module: "finance",
      risk_level: "critical",
      retention_tier: "financial",
      status: "succeeded",
      after_json: { comped, provider_id: row.provider_id, plan_id: row.plan_id },
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    return successResponse({ subscription: updated });
  } catch (error) {
    return handleApiError(error, "Failed to activate subscription");
  }
}
