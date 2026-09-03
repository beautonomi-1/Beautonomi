/**
 * Part M (OneSignal fan-out): booking-lifecycle notifications used to fan out to the
 * WHOLE provider team (owner + every active linked staff). On large teams that is a
 * push per booking event per staff member, most of whom are not involved.
 *
 * New default: assigned staff (booking_services.staff_id → provider_staff.user_id)
 * + the owner. Team-wide fan-out is only the fallback when the booking has no
 * assignee (or no assignee has an app login).
 *
 * Pure orchestration with injected loaders so it can be unit-tested without Supabase.
 */

export type BookingLikeForRecipients = {
  staff_id?: string | null;
  booking_services?: Array<{ staff_id?: string | null } | null> | null;
  services?: Array<{ staff_id?: string | null } | null> | null;
};

/** Distinct provider_staff ids assigned on the booking (booking-level + per-service). */
export function collectAssignedStaffIds(
  booking: BookingLikeForRecipients | null | undefined,
): string[] {
  if (!booking) return [];
  const ids = new Set<string>();
  if (booking.staff_id) ids.add(String(booking.staff_id));
  for (const list of [booking.booking_services, booking.services]) {
    for (const row of list ?? []) {
      const sid = row?.staff_id;
      if (sid) ids.add(String(sid));
    }
  }
  return [...ids];
}

export type ResolveBookingRecipientsLoaders = {
  /** provider_staff ids → distinct app user ids (active staff with a linked login only). */
  loadStaffUserIds: (providerId: string, staffIds: string[]) => Promise<string[]>;
  /** Full team (owner first + active linked staff). Used only as fallback. */
  loadTeamUserIds: (providerId: string) => Promise<string[]>;
};

export type ResolveBookingRecipientsResult = {
  recipients: string[];
  /** Which strategy produced the list — surfaced for tests/metrics. */
  basis: "assignee_and_owner" | "team" | "owner_only" | "none";
};

/**
 * Owner + assigned staff when the booking has assignees with logins; otherwise the
 * whole team; otherwise owner only. Owner is always first; ids are de-duplicated.
 * Loader failures degrade gracefully (never throw; never drop the owner).
 */
export async function resolveBookingProviderRecipients(params: {
  providerId: string | null | undefined;
  ownerUserId: string | null | undefined;
  assignedStaffIds: string[];
  loaders: ResolveBookingRecipientsLoaders;
}): Promise<ResolveBookingRecipientsResult> {
  const { providerId, ownerUserId, assignedStaffIds, loaders } = params;
  const ownerList = ownerUserId ? [ownerUserId] : [];

  if (!providerId) {
    return { recipients: ownerList, basis: ownerList.length ? "owner_only" : "none" };
  }

  if (assignedStaffIds.length > 0) {
    try {
      const staffUserIds = await loaders.loadStaffUserIds(providerId, assignedStaffIds);
      if (staffUserIds.length > 0) {
        const merged = new Set<string>(ownerList);
        for (const id of staffUserIds) if (id) merged.add(id);
        return { recipients: [...merged], basis: "assignee_and_owner" };
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `[notification-service] loadStaffUserIds(${providerId}) failed — falling back to team`,
        err,
      );
    }
  }

  try {
    const team = await loaders.loadTeamUserIds(providerId);
    if (team.length > 0) {
      const merged = new Set<string>(ownerList);
      for (const id of team) if (id) merged.add(id);
      return { recipients: [...merged], basis: "team" };
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[notification-service] getProviderTeamUserIds(${providerId}) failed — falling back to owner only`,
      err,
    );
  }

  return { recipients: ownerList, basis: ownerList.length ? "owner_only" : "none" };
}
