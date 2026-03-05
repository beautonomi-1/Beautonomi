import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getUserRoleServer, getPortalForUser, getDefaultRouteForPortal } from "@/lib/auth/role";
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
    const target = getDefaultRouteForPortal(portal);
    redirect(target);
  }

  return <PortalLandingContent />;
}
