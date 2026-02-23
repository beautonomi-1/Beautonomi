import { redirect } from "next/navigation";

/**
 * Redirect to consolidated Plans admin.
 * Pricing plans are now managed together with subscription plans at /admin/plans.
 */
export default function PricingPlansRedirect() {
  redirect("/admin/plans");
}
