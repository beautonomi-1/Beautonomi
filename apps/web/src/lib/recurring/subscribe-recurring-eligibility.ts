/** Same rules as hold consume: no reschedule, no group booking with participants. */
export function subscribeRecurringEligible(body: {
  subscribe_recurring?: { enabled?: boolean; frequency?: string } | null;
  reschedule_booking_id?: string | null | undefined;
  is_group_booking?: boolean;
  /** True when `group_participants` is a non-empty array (any shape). */
  has_group_participants?: boolean;
}): boolean {
  if (!body.subscribe_recurring?.enabled) return false;
  if (body.reschedule_booking_id) return false;
  if (body.is_group_booking === true && body.has_group_participants === true) {
    return false;
  }
  return true;
}
