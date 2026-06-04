import type { SupabaseClient } from "@supabase/supabase-js";
import { recalculateProviderGamification } from "@/lib/services/provider-gamification";

export const PROVIDER_POINTS_SELECT = `
        id,
        total_points,
        lifetime_points,
        current_tier_points,
        badge_earned_at,
        badge_expires_at,
        last_calculated_at,
        provider_badges!provider_points_current_badge_id_fkey (
          id,
          name,
          slug,
          description,
          icon_url,
          tier,
          color,
          requirements,
          benefits
        )
      `;

export type ProviderGamificationHealSignals = {
  completedBookings: number;
  storedBookings: number;
  reviewCount: number;
  transactionCount: number;
  hasProviderPointsRow: boolean;
};

/** When true, run backfill + booking sync + recalculate so points/badges match ledger truth. */
export function shouldHealProviderGamification(signals: ProviderGamificationHealSignals): boolean {
  if (signals.storedBookings !== signals.completedBookings) {
    return true;
  }
  const hasActivity =
    signals.completedBookings > 0 || signals.reviewCount > 0;
  if (hasActivity && signals.transactionCount === 0) {
    return true;
  }
  if (hasActivity && !signals.hasProviderPointsRow) {
    return true;
  }
  return false;
}

export async function fetchProviderGamificationHealSignals(
  admin: SupabaseClient,
  providerId: string,
  options?: { hasProviderPointsRow?: boolean },
): Promise<ProviderGamificationHealSignals> {
  const [{ count: completedBookingsCount }, { count: transactionCount }, { data: provRow }] =
    await Promise.all([
      admin
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("provider_id", providerId)
        .eq("status", "completed"),
      admin
        .from("provider_point_transactions")
        .select("id", { count: "exact", head: true })
        .eq("provider_id", providerId),
      admin
        .from("providers")
        .select("total_bookings, review_count")
        .eq("id", providerId)
        .maybeSingle(),
    ]);

  return {
    completedBookings: completedBookingsCount ?? 0,
    storedBookings: Number(provRow?.total_bookings ?? 0),
    reviewCount: Number(provRow?.review_count ?? 0),
    transactionCount: transactionCount ?? 0,
    hasProviderPointsRow: options?.hasProviderPointsRow ?? false,
  };
}

export type SyncProviderGamificationResult = {
  healed: boolean;
  transactionsBackfilled: boolean;
  bookingsSynced: boolean;
};

/**
 * Backfill ledger rows when missing, sync completed booking count, recalculate points/badges.
 * Safe to call on GET (read path) when {@link shouldHealProviderGamification} is true.
 */
export async function syncProviderGamification(
  admin: SupabaseClient,
  providerId: string,
  signals: ProviderGamificationHealSignals,
  options?: { force?: boolean },
): Promise<SyncProviderGamificationResult> {
  if (!options?.force && !shouldHealProviderGamification(signals)) {
    return { healed: false, transactionsBackfilled: false, bookingsSynced: false };
  }

  let transactionsBackfilled = false;
  const shouldBackfill =
    signals.transactionCount === 0 &&
    (signals.completedBookings > 0 || signals.reviewCount > 0);
  if (shouldBackfill) {
    try {
      await admin.rpc("backfill_provider_point_transactions", {
        p_provider_id: providerId,
      });
      transactionsBackfilled = true;
    } catch (backfillError) {
      console.warn("Failed to backfill provider point transactions:", backfillError);
    }
  }

  let bookingsSynced = false;
  if (options?.force || signals.storedBookings !== signals.completedBookings) {
    const targetBookings = signals.completedBookings;
    const { error } = await admin
      .from("providers")
      .update({ total_bookings: targetBookings })
      .eq("id", providerId);
    bookingsSynced = !error;
  }

  try {
    await recalculateProviderGamification(providerId);
  } catch (recalcError) {
    console.warn("Failed to recalculate provider gamification:", recalcError);
    if (!options?.force) {
      return {
        healed: false,
        transactionsBackfilled,
        bookingsSynced,
      };
    }
    throw recalcError;
  }

  return {
    healed: true,
    transactionsBackfilled,
    bookingsSynced:
      bookingsSynced || signals.storedBookings !== signals.completedBookings,
  };
}
