import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Mark provider onboarding lifecycle complete when the provider becomes active
 * (auto-approve or admin approval). Keeps `onboarding_state` and tracking
 * `wizard_status` in sync with marketplace-ready status.
 */
export async function markProviderOnboardingLifecycleComplete(
  supabase: SupabaseClient,
  params: {
    providerId: string;
    userId: string;
    tenantId?: string | null;
  },
): Promise<void> {
  const now = new Date().toISOString();

  const { error: providerErr } = await supabase
    .from("providers")
    .update({
      onboarding_state: "activated",
      updated_at: now,
    })
    .eq("id", params.providerId);

  if (providerErr) {
    console.error("[markProviderOnboardingLifecycleComplete] providers update:", providerErr);
  }

  const { error: trackErr } = await supabase.from("provider_onboarding_tracking").upsert(
    {
      user_id: params.userId,
      tenant_id: params.tenantId ?? null,
      provider_id: params.providerId,
      wizard_status: "completed",
      updated_at: now,
    },
    { onConflict: "user_id" },
  );

  if (trackErr) {
    console.error("[markProviderOnboardingLifecycleComplete] tracking upsert:", trackErr);
  }
}
