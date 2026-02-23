"use client";

import SubscriptionPlansPage from "../subscription-plans/page";
import RoleGuard from "@/components/auth/RoleGuard";

/**
 * Consolidated Plans admin: subscription plans + public pricing page in one place.
 * Renders the same form with useMergedPlans so superadmin can manage both without switching pages.
 */
export default function PlansPage() {
  return (
    <RoleGuard allowedRoles={["superadmin"]} redirectTo="/admin/dashboard">
      <SubscriptionPlansPage useMergedPlans />
    </RoleGuard>
  );
}
