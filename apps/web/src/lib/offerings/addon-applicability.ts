export type AddonTargetIds = {
  id: string;
  parent_service_id?: string | null;
  master_service_id?: string | null;
};

export function applicableAddonIds(target: AddonTargetIds): string[] {
  const ids = [target.id];
  if (target.parent_service_id) ids.push(target.parent_service_id);
  if (target.master_service_id) ids.push(target.master_service_id);
  return ids;
}

/** PostgREST `.or()` filter: applicable_service_ids is null OR overlaps target ids. */
export function buildAddonApplicabilityOrFilter(target: AddonTargetIds): string {
  const ids = applicableAddonIds(target);
  const parts = ["applicable_service_ids.is.null"];
  for (const id of ids) {
    parts.push(`applicable_service_ids.cs.{${id}}`);
  }
  return parts.join(",");
}

export function addonAppliesTo(
  addon: { applicable_service_ids?: string[] | null },
  target: AddonTargetIds,
): boolean {
  const applicable = addon.applicable_service_ids;
  if (!applicable || applicable.length === 0) return true;
  const ids = new Set(applicableAddonIds(target));
  return applicable.some((aid) => ids.has(aid));
}
