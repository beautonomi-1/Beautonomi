/**
 * Provider → client rating submission (POST /api/provider/ratings).
 *
 * A slow backend can commit the rating after the client gave up waiting, so a
 * TIMEOUT / network drop is not proof of failure. Before surfacing an error we
 * ask the server whether the rating for this booking now exists.
 */
import type { ApiError } from "@beautonomi/types";
import { api } from "@/lib/api-client";
import { isTransientApiFailure } from "@/lib/api-error";

const SUBMIT_TIMEOUT_MS = 45_000;
const VERIFY_TIMEOUT_MS = 20_000;
const VERIFY_ATTEMPTS = 3;
const VERIFY_BACKOFF_MS = 1_500;

export type ProviderClientRatingInput = {
  bookingId: string;
  rating: number;
  comment?: string;
  locationId?: string;
};

export type ProviderClientRatingResult =
  | { ok: true; rating: number }
  | { ok: false; error: ApiError };

type RatingLookup = { has_rating?: boolean; rating?: { rating?: number } | null };

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Returns `null` when the lookup itself failed (existence unknown). */
export async function lookupProviderClientRating(
  bookingId: string,
): Promise<{ exists: boolean; rating: number | null } | null> {
  const res = await api.get<RatingLookup>(
    `/api/provider/ratings?booking_id=${encodeURIComponent(bookingId)}`,
    { timeout: VERIFY_TIMEOUT_MS },
  );
  if (res.error) return null;
  const value = Number(res.data?.rating?.rating ?? NaN);
  return {
    exists: !!res.data?.has_rating,
    rating: Number.isFinite(value) && value >= 1 && value <= 5 ? value : null,
  };
}

/**
 * Polls a few times because the original insert may still be in flight on the
 * server. Resolves to the saved star value (or `null` if unreadable), or `false`.
 */
async function confirmSavedAfterTransientFailure(bookingId: string): Promise<number | null | false> {
  for (let attempt = 0; attempt < VERIFY_ATTEMPTS; attempt += 1) {
    if (attempt > 0) await wait(VERIFY_BACKOFF_MS * attempt);
    const lookup = await lookupProviderClientRating(bookingId);
    if (lookup?.exists) return lookup.rating;
  }
  return false;
}

export async function submitProviderClientRating(
  input: ProviderClientRatingInput,
): Promise<ProviderClientRatingResult> {
  const stars = Math.min(5, Math.max(1, Math.floor(Number(input.rating)) || 0));
  const comment = input.comment?.trim();
  const res = await api.post<{ id?: string; rating?: number }>(
    "/api/provider/ratings",
    {
      booking_id: input.bookingId,
      rating: stars,
      comment: comment || undefined,
      ...(input.locationId ? { location_id: input.locationId } : {}),
    },
    { timeout: SUBMIT_TIMEOUT_MS },
  );

  if (!res.error) {
    const saved = Number(res.data?.rating ?? NaN);
    return { ok: true, rating: Number.isFinite(saved) ? saved : stars };
  }

  if (isTransientApiFailure(res.error)) {
    const confirmed = await confirmSavedAfterTransientFailure(input.bookingId);
    if (confirmed !== false) return { ok: true, rating: confirmed ?? stars };
  }

  return { ok: false, error: res.error };
}
