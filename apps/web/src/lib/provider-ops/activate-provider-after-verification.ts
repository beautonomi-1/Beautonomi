import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchScopedSingle } from "@/lib/tenant/scoped-overrides";
import { markProviderOnboardingLifecycleComplete } from "@/lib/provider-ops/mark-provider-onboarding-lifecycle-complete";

export type ActivateProviderAfterVerificationResult = {
  activated: boolean;
  reason?: string;
};

/**
 * When a provider completed onboarding under auto-approve but was held at
 * pending_approval until identity verification, promote them to active once
 * verification is approved.
 */
export async function activateProviderAfterVerification(
  admin: SupabaseClient,
  params: { providerId: string; userId?: string | null },
): Promise<ActivateProviderAfterVerificationResult> {
  const { providerId, userId } = params;

  const { data: providerRow, error: fetchErr } = await admin
    .from("providers")
    .select("id, user_id, tenant_id, status, onboarding_state, business_name")
    .eq("id", providerId)
    .maybeSingle();

  if (fetchErr || !providerRow) {
    return { activated: false, reason: "provider_not_found" };
  }

  const provider = providerRow as {
    id: string;
    user_id?: string | null;
    tenant_id?: string | null;
    status?: string | null;
    onboarding_state?: string | null;
    business_name?: string | null;
  };

  if (provider.status === "suspended" || provider.status === "rejected") {
    return { activated: false, reason: "provider_not_eligible" };
  }

  if (provider.status !== "pending_approval") {
    return { activated: false, reason: "not_pending_approval" };
  }

  if (provider.onboarding_state !== "ready_for_activation") {
    return { activated: false, reason: "not_ready_for_activation" };
  }

  const tenantId = provider.tenant_id ?? null;
  if (!tenantId) {
    return { activated: false, reason: "missing_tenant" };
  }

  const scopedPlatformSettings = await fetchScopedSingle<Record<string, unknown>>({
    supabase: admin,
    table: "platform_settings",
    tenantId,
    select: "settings",
    apply: (q) => q.eq("is_active", true),
    orderBy: { column: "updated_at", ascending: false },
  });
  const platformSettings =
    (scopedPlatformSettings.data as { settings?: Record<string, unknown> } | null)?.settings ?? null;
  const autoApprove =
    (platformSettings as { features?: { auto_approve_providers?: boolean } } | null)?.features
      ?.auto_approve_providers === true;

  if (!autoApprove) {
    return { activated: false, reason: "auto_approve_disabled" };
  }

  const ownerUserId = userId ?? provider.user_id ?? null;
  if (!ownerUserId) {
    return { activated: false, reason: "missing_user" };
  }

  const now = new Date().toISOString();
  const { error: updateErr } = await admin
    .from("providers")
    .update({ status: "active", onboarding_state: "activated", updated_at: now })
    .eq("id", providerId);

  if (updateErr) {
    console.error("[activateProviderAfterVerification] providers update:", updateErr);
    return { activated: false, reason: "update_failed" };
  }

  await markProviderOnboardingLifecycleComplete(admin, {
    providerId,
    userId: ownerUserId,
    tenantId,
  });

  try {
    const { sendTemplateNotification } = await import("@/lib/notifications/onesignal");
    await sendTemplateNotification(
      "provider_approved",
      [ownerUserId],
      { business_name: provider.business_name || "" },
      ["push", "email", "sms"],
      { appType: "provider" },
    );
  } catch (notifErr) {
    console.warn("[activateProviderAfterVerification] notification failed:", notifErr);
  }

  return { activated: true };
}
