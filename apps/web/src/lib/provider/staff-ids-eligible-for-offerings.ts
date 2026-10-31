import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Intersect candidates with each offering's staff_services rows.
 * Offerings with zero rows do not narrow the list.
 */
export async function staffIdsEligibleForOfferings(
  supabase: SupabaseClient,
  candidateIds: string[],
  offeringIds: string[],
): Promise<string[]> {
  if (candidateIds.length === 0 || offeringIds.length === 0) {
    return candidateIds;
  }

  const uniqueOfferings = [...new Set(offeringIds.filter(Boolean))];
  const { data: rows } = await supabase
    .from("staff_services")
    .select("offering_id, staff_id")
    .in("offering_id", uniqueOfferings);

  const restricted = new Map<string, Set<string>>();
  for (const oid of uniqueOfferings) {
    const staffIds = (rows ?? [])
      .filter((r: { offering_id: string }) => r.offering_id === oid)
      .map((r: { staff_id: string }) => r.staff_id);
    if (staffIds.length > 0) {
      restricted.set(oid, new Set(staffIds));
    }
  }

  let result = candidateIds;
  for (const oid of uniqueOfferings) {
    const allowed = restricted.get(oid);
    if (!allowed) continue;
    result = result.filter((id) => allowed.has(id));
  }
  return result;
}
