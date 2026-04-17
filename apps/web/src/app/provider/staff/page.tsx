import { redirect } from "next/navigation";

/**
 * Legacy `/provider/staff` route. The canonical staff UX lives on `/provider/team/members`,
 * which shares a backend with `/api/provider/staff` but uses the modern PageHeader + SectionCard
 * design with proper stats cards, mobile/desktop split, and location-aware caching.
 *
 * Keeping two competing staff pages caused drift and UX inconsistencies — redirect instead of
 * maintaining a duplicate implementation.
 */
export default function ProviderStaffLegacyRedirect() {
  redirect("/provider/team/members");
}
