import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { notifyProviderMembershipCancelled } from "@/lib/notifications";

/**
 * POST /api/me/membership/cancel
 *
 * Cancel the current user's active membership (sets status to cancelled, auto_renew to false).
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request
    );
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const body = await request.json().catch(() => ({}));
    const providerMembershipId =
      typeof body?.provider_membership_id === "string" ? body.provider_membership_id : null;
    const cancelImmediately = body?.cancel_immediately === true;

    if (providerMembershipId) {
      const { data: activeSalon, error: salonFindError } = await (supabase
        .from("user_memberships") as any)
        .select(
          "id, user_id, status, expires_at, provider:providers(id, tenant_id, user_id, business_name), plan:membership_plans(id, name)"
        )
        .eq("id", providerMembershipId)
        .eq("user_id", user.id)
        .in("status", ["active", "past_due"])
        .maybeSingle();

      const provider = Array.isArray(activeSalon?.provider)
        ? activeSalon?.provider[0]
        : activeSalon?.provider;
      const plan = Array.isArray(activeSalon?.plan)
        ? activeSalon?.plan[0]
        : activeSalon?.plan;
      if (salonFindError || !activeSalon || provider?.tenant_id !== tenantId) {
        return successResponse({ cancelled: false, message: "No active salon membership found" });
      }

      const { error: salonUpdateError } = await (supabase.from("user_memberships") as any)
        .update({
          status: cancelImmediately ? "cancelled" : activeSalon.status,
          auto_renew: false,
          cancelled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", providerMembershipId)
        .eq("user_id", user.id);

      if (salonUpdateError) {
        return handleApiError(salonUpdateError, "Failed to cancel salon membership");
      }

      // §Membership-cancel 2026-05: notify the provider team so the salon
      // sees the cancellation in real time (the customer-side reflects it
      // via the cancelled_at flag on the next clients refresh, but a push
      // makes it actionable immediately for membership-driven business).
      // Failure to notify must not break the cancel response.
      try {
        let customerName = "A customer";
        try {
          const admin = getSupabaseAdmin();
          const { data: customer } = await (admin.from("users") as any)
            .select("full_name")
            .eq("id", user.id)
            .maybeSingle();
          const fullName = (customer as { full_name?: string | null } | null)?.full_name;
          if (typeof fullName === "string" && fullName.trim()) {
            customerName = fullName.trim();
          }
        } catch {
          // best-effort customer name lookup
        }

        if (provider?.id) {
          await notifyProviderMembershipCancelled({
            providerId: provider.id,
            providerOwnerUserId: provider?.user_id ?? null,
            customerName,
            planName: plan?.name ?? "membership",
            customerId: user.id,
            subscriptionId: providerMembershipId,
          });
        }
      } catch (notifyError) {
        console.error(
          "[membership/cancel] notifyProviderMembershipCancelled failed:",
          notifyError,
        );
      }

      return successResponse({
        cancelled: true,
        type: "salon",
        cancel_immediately: cancelImmediately,
        benefits_until: cancelImmediately ? null : activeSalon.expires_at ?? null,
      });
    }

    const { data: active, error: findError } = await supabase
      .from("customer_memberships")
      .select("id, status, expires_at")
      .eq("customer_id", user.id)
      .eq("status", "active")
      .order("expires_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (findError || !active) {
      return successResponse({ cancelled: false, message: "No active membership found" });
    }

    // §Membership-cancel 2026-07: platform memberships now default to
    // cancel-at-period-end (parity with salon memberships) — disable auto-renew
    // and stamp cancelled_at, but keep the plan active until it expires so the
    // customer keeps the benefits they already paid for. `cancel_immediately`
    // still ends it now for support/refund flows.
    const { error: updateError } = await supabase
      .from("customer_memberships")
      .update({
        status: cancelImmediately ? "cancelled" : (active as { status?: string }).status ?? "active",
        auto_renew: false,
        cancelled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", active.id)
      .eq("customer_id", user.id);

    if (updateError) {
      return handleApiError(updateError, "Failed to cancel membership");
    }

    return successResponse({
      cancelled: true,
      type: "platform",
      cancel_immediately: cancelImmediately,
      benefits_until: cancelImmediately ? null : (active as { expires_at?: string | null }).expires_at ?? null,
    });
  } catch (error) {
    return handleApiError(error, "Failed to cancel membership");
  }
}
