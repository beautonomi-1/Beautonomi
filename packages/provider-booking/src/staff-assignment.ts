/** Sentinel for "any available team member" on provider create flows (matches customer/public "any"). */
export const ANY_STAFF_ID = "any";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isAnyStaffId(staffId: string | null | undefined): boolean {
  return staffId === ANY_STAFF_ID;
}

export function isStaffChoiceMade(staffId: string | null | undefined): boolean {
  if (staffId == null) return false;
  const trimmed = String(staffId).trim();
  if (!trimmed) return false;
  if (isAnyStaffId(trimmed)) return true;
  return UUID_RE.test(trimmed);
}

/** Strip "any" before sending staff_ids to availability APIs (omit param = any on server). */
export function staffIdsForAvailabilityQuery(staffIds: (string | undefined | null)[]): string[] {
  return staffIds
    .filter((id): id is string => Boolean(id?.trim()) && !isAnyStaffId(id))
    .map((id) => id.trim());
}
