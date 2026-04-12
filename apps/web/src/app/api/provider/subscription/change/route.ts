import { NextRequest } from "next/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { providerTenantMismatchResponse } from "@/lib/tenant/provider-matches-host";
import { extractSubscriptionPlanUuid } from "@/lib/subscription/extract-subscription-plan-uuid";

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "superadmin"], request);
    const hostTenantId = await resolveTenantIdWithZaFallback(request);

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");

    const marketMismatch = await providerTenantMismatchResponse(
      supabaseAdmin,
      hostTenantId,
      providerId,
    );
    if (marketMismatch) return marketMismatch;

    const { data: providerRow } = await supabaseAdmin
      .from("providers")
      .select("tenant_id")
      .eq("id", providerId)
      .maybeSingle();
    const subscriptionTenantId = await resolveTenantIdForFinanceLedger(supabaseAdmin, {
      tenant_id: (providerRow as { tenant_id?: string | null } | null)?.tenant_id ?? null,
      provider_id: providerId,
    });

    const body = await request.json();
    const rawPlanId = body.plan_id;
    const plan_id =
      typeof rawPlanId === "string" ? extractSubscriptionPlanUuid(rawPlanId) : rawPlanId;

    if (!plan_id) {
      return handleApiError(new Error("plan_id is required"), "VALIDATION_ERROR", 400);
    }

    const { data: plan } = await supabaseAdmin
      .from("subscription_plans")
      .select("id, name, price_monthly, price_yearly, is_free")
      .eq("id", plan_id)
      .eq("is_active", true)
      .maybeSingle();

    if (!plan) {
      return handleApiError(new Error("Plan not found"), "NOT_FOUND", 404);
    }

    // Only allow switching to free plans via this route.
    // Paid plan upgrades must go through the upgrade/initialize-payment flow.
    type PlanFields = { id: string; name: string; price_monthly?: number | null; price_yearly?: number | null; is_free?: boolean | null };
    const p = plan as PlanFields;
    const hasNonZeroMonthly = p.price_monthly != null && Number(p.price_monthly) > 0;
    const hasNonZeroYearly = p.price_yearly != null && Number(p.price_yearly) > 0;
    const isFreeTarget = p.is_free === true || (!hasNonZeroMonthly && !hasNonZeroYearly);
    if (!isFreeTarget) {
      return handleApiError(
        new Error("Paid plan changes require the upgrade flow with payment"),
        "PAYMENT_REQUIRED",
        400
      );
    }

    const { error: updateError } = await supabaseAdmin
      .from("provider_subscriptions")
      .update({ plan_id, updated_at: new Date().toISOString() })
      .eq("provider_id", providerId);

    if (updateError) {
      const { error: insertError } = await supabaseAdmin
        .from("provider_subscriptions")
        .insert({
          provider_id: providerId,
          plan_id,
          status: "active",
          tenant_id: subscriptionTenantId,
        });
      if (insertError) throw insertError;
    }

    return successResponse({ success: true });
  } catch (error) {
    console.error("Error changing subscription:", error);
    return handleApiError(error, "Failed to change subscription plan");
  }
}
