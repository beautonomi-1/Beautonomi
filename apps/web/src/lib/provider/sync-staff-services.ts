import type { SupabaseClient } from "@supabase/supabase-js";

export async function overlayTeamMemberIdsFromStaffServices<
  T extends { id: string; team_member_ids?: string[] | null },
>(supabase: SupabaseClient, providerId: string, offerings: T[]): Promise<T[]> {
  if (offerings.length === 0) return offerings;
  const ids = offerings.map((o) => o.id);
  const { data: rows } = await supabase
    .from("staff_services")
    .select("offering_id, staff_id")
    .eq("provider_id", providerId)
    .in("offering_id", ids);

  const byOffering = new Map<string, string[]>();
  for (const row of rows ?? []) {
    const oid = (row as { offering_id: string }).offering_id;
    const sid = (row as { staff_id: string }).staff_id;
    const list = byOffering.get(oid) ?? [];
    list.push(sid);
    byOffering.set(oid, list);
  }

  return offerings.map((o) => {
    const fromTable = byOffering.get(o.id);
    if (fromTable && fromTable.length > 0) {
      return { ...o, team_member_ids: [...new Set(fromTable)] };
    }
    return o;
  });
}

async function loadActiveServiceProviderIds(
  supabase: SupabaseClient,
  providerId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("provider_staff")
    .select("id, is_service_provider, is_active")
    .eq("provider_id", providerId)
    .eq("is_active", true);
  return (data ?? [])
    .filter((r: { is_service_provider?: boolean | null }) => r.is_service_provider !== false)
    .map((r: { id: string }) => r.id);
}

async function materializeImplicitStaffForOffering(
  supabase: SupabaseClient,
  providerId: string,
  offeringId: string,
): Promise<void> {
  const { count } = await supabase
    .from("staff_services")
    .select("staff_id", { count: "exact", head: true })
    .eq("offering_id", offeringId);
  if ((count ?? 0) > 0) return;

  const staffIds = await loadActiveServiceProviderIds(supabase, providerId);
  if (staffIds.length === 0) return;

  const rows = staffIds.map((staffId) => ({
    staff_id: staffId,
    offering_id: offeringId,
    provider_id: providerId,
  }));
  await supabase.from("staff_services").upsert(rows, {
    onConflict: "staff_id,offering_id",
    ignoreDuplicates: true,
  });
}

async function variantIdsForParent(
  supabase: SupabaseClient,
  providerId: string,
  parentOfferingId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("offerings")
    .select("id")
    .eq("provider_id", providerId)
    .eq("parent_service_id", parentOfferingId);
  return (data ?? []).map((r: { id: string }) => r.id);
}

async function syncStaffServicesToVariants(
  supabase: SupabaseClient,
  providerId: string,
  parentOfferingId: string,
  staffIds: string[],
): Promise<void> {
  const variantIds = await variantIdsForParent(supabase, providerId, parentOfferingId);
  const allIds = [parentOfferingId, ...variantIds];
  for (const offeringId of allIds) {
    await supabase.from("staff_services").delete().eq("offering_id", offeringId);
    if (staffIds.length === 0) continue;
    const rows = staffIds.map((staffId) => ({
      staff_id: staffId,
      offering_id: offeringId,
      provider_id: providerId,
    }));
    await supabase.from("staff_services").insert(rows);
  }
}

/** After variant rows are upserted, copy the parent's current staff_services onto variant offering ids. */
export async function syncVariantStaffServicesFromParent(
  supabase: SupabaseClient,
  providerId: string,
  parentOfferingId: string,
): Promise<void> {
  const { data: parentRows } = await supabase
    .from("staff_services")
    .select("staff_id")
    .eq("offering_id", parentOfferingId);
  const staffIds = [...new Set((parentRows ?? []).map((r: { staff_id: string }) => r.staff_id))];
  if (staffIds.length === 0) return;
  await syncStaffServicesToVariants(supabase, providerId, parentOfferingId, staffIds);
}

/** Service form / PATCH offering: full team list replaces rows (empty = unrestricted). */
export async function replaceStaffForOffering(
  supabase: SupabaseClient,
  providerId: string,
  parentOfferingId: string,
  staffIds: string[],
): Promise<void> {
  const uniqueStaff = [...new Set(staffIds.filter(Boolean))];

  await syncStaffServicesToVariants(supabase, providerId, parentOfferingId, uniqueStaff);

  await supabase
    .from("offerings")
    .update({
      team_member_ids: uniqueStaff,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parentOfferingId)
    .eq("provider_id", providerId);
}

/** Hire / staff PATCH: update one person's offerings; materialize before first restriction per offering. */
export async function replaceStaffServicesForStaff(
  supabase: SupabaseClient,
  providerId: string,
  staffId: string,
  desiredOfferingIds: string[],
): Promise<void> {
  const desired = new Set(desiredOfferingIds.filter(Boolean));

  const { data: currentRows } = await supabase
    .from("staff_services")
    .select("offering_id")
    .eq("staff_id", staffId);

  const current = new Set((currentRows ?? []).map((r: { offering_id: string }) => r.offering_id));

  const toAdd = [...desired].filter((id) => !current.has(id));
  const toRemove = [...current].filter((id) => !desired.has(id));

  for (const offeringId of toAdd) {
    await materializeImplicitStaffForOffering(supabase, providerId, offeringId);
    await supabase.from("staff_services").upsert(
      {
        staff_id: staffId,
        offering_id: offeringId,
        provider_id: providerId,
      },
      { onConflict: "staff_id,offering_id", ignoreDuplicates: true },
    );
  }

  if (toRemove.length > 0) {
    await supabase
      .from("staff_services")
      .delete()
      .eq("staff_id", staffId)
      .in("offering_id", toRemove);
  }
}
