import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Enforce branch scoping for provider_staff on a single booking.
 * Owners, superadmins, and staff with role owner/manager (in provider_staff) see all branches.
 * Other staff must have the booking's location_id in provider_staff_locations, or have no
 * location rows (legacy / implicit all), or the booking must have no location_id.
 */
export async function assertProviderUserCanAccessBookingBranch(
  admin: SupabaseClient,
  userId: string,
  userRole: string | undefined,
  providerId: string,
  bookingLocationId: string | null | undefined
): Promise<{ allowed: true } | { allowed: false; message: string }> {
  if (userRole === "superadmin" || userRole === "provider_manager") {
    return { allowed: true as const };
  }

  const { data: ownerRow } = await admin
    .from("providers")
    .select("id")
    .eq("id", providerId)
    .eq("user_id", userId)
    .maybeSingle();

  if (ownerRow) {
    return { allowed: true as const };
  }

  if (userRole !== "provider_staff") {
    return { allowed: false as const, message: "Forbidden" };
  }

  const { data: staffRow } = await admin
    .from("provider_staff")
    .select("id, role")
    .eq("provider_id", providerId)
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (!staffRow?.id) {
    return { allowed: false as const, message: "Forbidden" };
  }

  const staffRole = (staffRow as { role?: string }).role;
  if (staffRole === "owner" || staffRole === "manager") {
    return { allowed: true as const };
  }

  if (!bookingLocationId) {
    return { allowed: true as const };
  }

  const { data: assignedLocations } = await admin
    .from("provider_staff_locations")
    .select("location_id")
    .eq("staff_id", staffRow.id);

  const ids =
    assignedLocations?.map((r: { location_id: string }) => r.location_id).filter(Boolean) ?? [];

  if (ids.length === 0) {
    return { allowed: true as const };
  }

  if (ids.includes(bookingLocationId)) {
    return { allowed: true as const };
  }

  return {
    allowed: false as const,
    message: "This booking belongs to a location you are not assigned to.",
  };
}
