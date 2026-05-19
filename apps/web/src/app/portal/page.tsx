import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getPortalForUser, getDefaultRouteForPortal } from "@/lib/auth/role";
import { getUserRoleServer } from "@/lib/auth/role-server";
import PortalLandingContent from "./PortalLandingContent";

/**
 * Canonical portal route: one link for "Dashboard" that routes by role.
 * - Logged in: redirect to admin dashboard, provider dashboard, provider get-started, or customer bookings.
 * - Not logged in: show booking portal landing (secure link info).
 */
export default async function PortalPage() {
  const supabase = await getSupabaseServer();
  const result = await getUserRoleServer(supabase);

  if (result) {
    const portal = getPortalForUser({
      role: result.role,
      provider_status: result.provider_status,
    });
    if (portal === "customer") {
      const { data } = await supabase
        .from("users")
        .select("customer_onboarding_completed_at")
        .eq("id", result.userId)
        .maybeSingle();
      if (!data?.customer_onboarding_completed_at) {
        redirect("/onboarding");
      }
    }
    // Superadmin: send to dedicated admin login (they are already signed in, so it will redirect to dashboard)
    const target =
      portal === "admin"
        ? "/admin/login?next=" + encodeURIComponent("/admin/dashboard")
        : getDefaultRouteForPortal(portal);
    redirect(target);
  }

  return <PortalLandingContent />;
}
