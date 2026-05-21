/**
 * Recalculates and persists `group_bookings.total_price` from live participant
 * rows, product lines, travel fee, and any attached package discount.
 *
 * This is called from:
 *   • POST /api/provider/group-bookings/[id]/participants (add participant)
 *   • DELETE /api/provider/group-bookings/[id]/participants/[pid] (remove participant)
 *   • POST /api/me/bookings/[id]/cancel (non-primary participant self-cancel)
 *
 * Always uses the service-role admin client so it can read all participant rows
 * regardless of RLS context.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import {
  groupPackageTotal,
  groupProductLineTotal,
  validateAndPriceGroupPackage,
} from "./group-booking-package-pricing";

export async function recalculateGroupBookingTotal(
  admin: SupabaseClient,
  groupId: string
): Promise<void> {
  const [{ data: group }, { data: participantRows }] = await Promise.all([
    admin
      .from("group_bookings")
      .select(
        "products, travel_fee, location_type, package_id, provider_id, location_id, service_id"
      )
      .eq("id", groupId)
      .maybeSingle(),
    admin
      .from("booking_participants")
      .select("price, service_id")
      .eq("group_booking_id", groupId),
  ]);

  const products = Array.isArray(group?.products) ? group.products : [];
  const participantTotal = (participantRows ?? []).reduce(
    (sum: number, p: { price?: unknown }) =>
      sum + Math.max(0, Number(p.price || 0)),
    0
  );
  const productTotal = products.reduce(
    (sum: number, p: unknown) =>
      sum + groupProductLineTotal(p as Record<string, unknown>),
    0
  );
  const travelFee =
    group?.location_type === "at_home"
      ? Math.max(0, Number(group.travel_fee || 0))
      : 0;

  let packageDiscount = 0;
  if (group?.package_id && group?.provider_id) {
    const pkgPricing = await validateAndPriceGroupPackage({
      supabaseAdmin: admin,
      providerId: group.provider_id as string,
      packageId: group.package_id as string,
      locationType: String(group.location_type || "at_salon"),
      locationId: group.location_id as string | null | undefined,
      participantRows: (participantRows ?? []) as Array<Record<string, unknown>>,
      fallbackServiceId: group.service_id as string | null | undefined,
      productRows: products,
      participantTotal,
    });
    if (pkgPricing.ok) packageDiscount = pkgPricing.packageDiscount;
  }

  await admin
    .from("group_bookings")
    .update({
      total_price: groupPackageTotal({
        participantTotal,
        productTotal,
        travelFee,
        packageDiscount,
      }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", groupId);
}

/** Best-effort wrapper — logs on failure but never throws. */
export async function tryRecalculateGroupBookingTotal(
  admin: SupabaseClient,
  groupId: string
): Promise<void> {
  try {
    await recalculateGroupBookingTotal(admin, groupId);
  } catch (error) {
    console.warn("[group total] recalculation failed for group", groupId, error);
  }
}
