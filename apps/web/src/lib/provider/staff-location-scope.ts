/**
 * Roster vs branch: permissions stay org-wide; location assignments decide
 * who appears on a branch calendar. Legacy tenants with no junction rows
 * (or a single location) still see everyone.
 */

export type StaffLocationScope = {
  /** null = do not filter. [] = nobody at this branch. */
  staffIds: string[] | null;
  mode: "all" | "strict";
};

type QueryClient = {
  from: (table: string) => any;
};

export function applyLocationScopeToStaffIds(
  allStaffIds: string[],
  scope: StaffLocationScope,
): string[] {
  if (scope.staffIds === null) return allStaffIds;
  const allowed = new Set(scope.staffIds);
  return allStaffIds.filter((id) => allowed.has(id));
}

export function isStaffInLocationScope(staffId: string, scope: StaffLocationScope): boolean {
  if (scope.staffIds === null) return true;
  return scope.staffIds.includes(staffId);
}

export function decideStaffLocationScope(input: {
  locationId: string | null | undefined;
  locationBelongsToProvider: boolean;
  activeLocationCount: number;
  providerJunctionCount: number;
  assignedStaffIds: string[];
  /** Staff with zero junction rows — treated as every branch until assigned. */
  unassignedStaffIds?: string[];
}): StaffLocationScope {
  if (!input.locationId) {
    return { staffIds: null, mode: "all" };
  }
  if (!input.locationBelongsToProvider) {
    return { staffIds: [], mode: "strict" };
  }

  const assigned = input.assignedStaffIds.filter(Boolean);
  const unassigned = (input.unassignedStaffIds ?? []).filter(Boolean);
  const useLegacy = input.activeLocationCount <= 1 || input.providerJunctionCount === 0;
  if (useLegacy && assigned.length === 0) {
    return { staffIds: null, mode: "all" };
  }

  return { staffIds: [...new Set([...assigned, ...unassigned])], mode: "strict" };
}

export async function loadProviderLocationAssignmentUsage(
  supabase: QueryClient,
  providerId: string,
): Promise<{
  activeLocationCount: number;
  providerJunctionCount: number;
  staffIds: string[];
}> {
  const [locCountRes, staffRes] = await Promise.all([
    supabase
      .from("provider_locations")
      .select("id", { count: "exact", head: true })
      .eq("provider_id", providerId)
      .eq("is_active", true),
    supabase.from("provider_staff").select("id").eq("provider_id", providerId),
  ]);

  if (locCountRes.error) throw locCountRes.error;
  if (staffRes.error) throw staffRes.error;

  const staffIds = ((staffRes.data ?? []) as Array<{ id: string }>).map((s) => s.id);
  let providerJunctionCount = 0;
  if (staffIds.length > 0) {
    const junctionRes = await supabase
      .from("provider_staff_locations")
      .select("id", { count: "exact", head: true })
      .in("staff_id", staffIds);
    if (junctionRes.error) throw junctionRes.error;
    providerJunctionCount = junctionRes.count ?? 0;
  }

  return {
    activeLocationCount: locCountRes.count ?? 0,
    providerJunctionCount,
    staffIds,
  };
}

export async function resolveStaffLocationScope(
  supabase: QueryClient,
  providerId: string,
  locationId: string | null | undefined,
): Promise<StaffLocationScope> {
  if (!locationId) {
    return { staffIds: null, mode: "all" };
  }

  const [locationRes, assignmentsRes, usage] = await Promise.all([
    supabase
      .from("provider_locations")
      .select("id")
      .eq("id", locationId)
      .eq("provider_id", providerId)
      .maybeSingle(),
    supabase.from("provider_staff_locations").select("staff_id").eq("location_id", locationId),
    loadProviderLocationAssignmentUsage(supabase, providerId),
  ]);

  if (locationRes.error) throw locationRes.error;
  if (assignmentsRes.error) throw assignmentsRes.error;

  let unassignedStaffIds: string[] = [];
  if (usage.staffIds.length > 0 && usage.providerJunctionCount > 0) {
    const linkedRes = await supabase
      .from("provider_staff_locations")
      .select("staff_id")
      .in("staff_id", usage.staffIds);
    if (linkedRes.error) throw linkedRes.error;
    const linked = new Set(
      ((linkedRes.data ?? []) as Array<{ staff_id: string }>).map((r) => r.staff_id),
    );
    unassignedStaffIds = usage.staffIds.filter((id) => !linked.has(id));
  }

  return decideStaffLocationScope({
    locationId,
    locationBelongsToProvider: Boolean(locationRes.data),
    activeLocationCount: usage.activeLocationCount,
    providerJunctionCount: usage.providerJunctionCount,
    assignedStaffIds: ((assignmentsRes.data ?? []) as Array<{ staff_id: string }>).map(
      (a) => a.staff_id,
    ),
    unassignedStaffIds,
  });
}

export async function listActiveStaffIdsForLocation(
  supabase: QueryClient,
  providerId: string,
  locationId: string | null | undefined,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("provider_staff")
    .select("id")
    .eq("provider_id", providerId)
    .eq("is_active", true);
  if (error) throw error;
  const ids = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
  if (!locationId) return ids;
  const scope = await resolveStaffLocationScope(supabase, providerId, locationId);
  return applyLocationScopeToStaffIds(ids, scope);
}

export function decideUnassignedStaffBranchAccess(input: {
  assignedLocationIds: string[];
  bookingLocationId: string | null | undefined;
  activeLocationCount: number;
  providerJunctionCount: number;
}): { allowed: true } | { allowed: false; message: string } {
  if (!input.bookingLocationId) {
    return { allowed: true };
  }

  if (input.assignedLocationIds.length > 0) {
    if (input.assignedLocationIds.includes(input.bookingLocationId)) {
      return { allowed: true };
    }
    return {
      allowed: false,
      message: "This booking belongs to a location you are not assigned to.",
    };
  }

  return { allowed: true };
}
