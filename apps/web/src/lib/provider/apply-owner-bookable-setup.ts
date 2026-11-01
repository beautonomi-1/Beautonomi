import type { SupabaseClient } from "@supabase/supabase-js";
import { seedStaffSchedulesOnCreate } from "@/lib/provider/seed-staff-schedules";

export type CreatedOfferingRef = {
  id: string;
  service_type?: string | null;
};

export type ApplyOwnerBookableSetupInput = {
  takesAppointments: boolean;
  publicTitle?: string | null;
  /** Offerings created in the same order as the submitted `services` array (parents only). */
  createdParentOfferings: CreatedOfferingRef[];
  /** Indexes into the submitted services array; empty/null means all non-addon parents. */
  serviceIndexes?: number[] | null;
  primaryLocationId: string | null;
};

function isAddonOffering(serviceType: string | null | undefined): boolean {
  return serviceType === "addon";
}

function resolveParentOfferingIds(input: ApplyOwnerBookableSetupInput): string[] {
  const parents = input.createdParentOfferings.filter((o) => !isAddonOffering(o.service_type));
  const indexes = input.serviceIndexes?.filter((i) => Number.isInteger(i) && i >= 0) ?? [];

  if (indexes.length === 0) {
    return parents.map((o) => o.id);
  }

  const ids: string[] = [];
  for (const idx of indexes) {
    const ref = input.createdParentOfferings[idx];
    if (!ref?.id || isAddonOffering(ref.service_type)) continue;
    ids.push(ref.id);
  }
  if (ids.length === 0) {
    return parents.map((o) => o.id);
  }
  return [...new Set(ids)];
}

async function variantOfferingIdsForParents(
  supabase: SupabaseClient,
  providerId: string,
  parentIds: string[],
): Promise<string[]> {
  if (parentIds.length === 0) return [];
  const { data } = await supabase
    .from("offerings")
    .select("id")
    .eq("provider_id", providerId)
    .in("parent_service_id", parentIds);
  return (data ?? []).map((r: { id: string }) => r.id);
}

async function ownerHasScheduleRows(
  supabase: SupabaseClient,
  staffId: string,
): Promise<boolean> {
  const { count } = await supabase
    .from("staff_schedules")
    .select("id", { count: "exact", head: true })
    .eq("staff_id", staffId);
  return (count ?? 0) > 0;
}

/**
 * After ensure_provider_owner_staff / freelancer setup: set bookable flags, optional public title,
 * staff_services for selected offerings (+ variants), and seed one weekly schedule when bookable.
 */
export async function applyOwnerBookableSetup(
  supabase: SupabaseClient,
  providerId: string,
  ownerUserId: string,
  input: ApplyOwnerBookableSetupInput,
): Promise<{ ownerStaffId: string | null }> {
  const { data: ownerStaff } = await supabase
    .from("provider_staff")
    .select("id, is_service_provider, avatar_url")
    .eq("provider_id", providerId)
    .eq("user_id", ownerUserId)
    .maybeSingle();

  if (!ownerStaff?.id) {
    return { ownerStaffId: null };
  }

  const staffId = ownerStaff.id as string;
  const publicTitle =
    typeof input.publicTitle === "string" && input.publicTitle.trim()
      ? input.publicTitle.trim()
      : null;

  let providerAvatarUrl: string | null = null;
  const staffAvatar = (ownerStaff as { avatar_url?: string | null }).avatar_url;
  if (!staffAvatar) {
    const { data: providerRow } = await supabase
      .from("providers")
      .select("avatar_url")
      .eq("id", providerId)
      .maybeSingle();
    providerAvatarUrl = (providerRow as { avatar_url?: string | null } | null)?.avatar_url ?? null;
  }

  const avatarPatch =
    !staffAvatar && providerAvatarUrl ? { avatar_url: providerAvatarUrl } : {};

  if (!input.takesAppointments) {
    await supabase
      .from("provider_staff")
      .update({
        is_service_provider: false,
        enable_in_online_booking: false,
        ...(publicTitle !== null ? { public_title: publicTitle } : {}),
        ...avatarPatch,
        updated_at: new Date().toISOString(),
      })
      .eq("id", staffId);
    return { ownerStaffId: staffId };
  }

  await supabase
    .from("provider_staff")
    .update({
      is_service_provider: true,
      enable_in_online_booking: true,
      ...(publicTitle !== null ? { public_title: publicTitle } : {}),
      ...avatarPatch,
      updated_at: new Date().toISOString(),
    })
    .eq("id", staffId);

  const parentIds = resolveParentOfferingIds(input);
  const variantIds = await variantOfferingIdsForParents(supabase, providerId, parentIds);
  const offeringIds = [...new Set([...parentIds, ...variantIds])];

  if (offeringIds.length > 0) {
    const rows = offeringIds.map((offeringId) => ({
      staff_id: staffId,
      offering_id: offeringId,
      provider_id: providerId,
    }));
    await supabase.from("staff_services").upsert(rows, {
      onConflict: "staff_id,offering_id",
      ignoreDuplicates: true,
    });
  }

  const hasSchedule = await ownerHasScheduleRows(supabase, staffId);
  if (!hasSchedule && input.primaryLocationId) {
    await seedStaffSchedulesOnCreate(supabase, providerId, staffId, input.primaryLocationId, {
      type: "location",
      locationId: input.primaryLocationId,
    });
  }

  return { ownerStaffId: staffId };
}

/** Admin-assisted onboarding: only when owner has no staff_services and is not manage-only. */
export async function applyOwnerBookableSetupIfUnset(
  supabase: SupabaseClient,
  providerId: string,
  ownerUserId: string,
  primaryLocationId: string | null,
): Promise<void> {
  const { data: ownerStaff } = await supabase
    .from("provider_staff")
    .select("id, is_service_provider")
    .eq("provider_id", providerId)
    .eq("user_id", ownerUserId)
    .maybeSingle();

  if (!ownerStaff?.id) return;
  if (ownerStaff.is_service_provider === false) return;

  const { count } = await supabase
    .from("staff_services")
    .select("offering_id", { count: "exact", head: true })
    .eq("staff_id", ownerStaff.id);

  if ((count ?? 0) > 0) return;

  const { data: offerings } = await supabase
    .from("offerings")
    .select("id, service_type")
    .eq("provider_id", providerId)
    .eq("is_active", true)
    .is("parent_service_id", null);

  const parents = (offerings ?? []).filter(
    (o: { service_type?: string | null }) => !isAddonOffering(o.service_type),
  );

  await applyOwnerBookableSetup(supabase, providerId, ownerUserId, {
    takesAppointments: true,
    createdParentOfferings: parents as CreatedOfferingRef[],
    serviceIndexes: null,
    primaryLocationId,
  });
}
