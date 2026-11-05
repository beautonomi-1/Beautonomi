/** Value for explore_posts.source_booking_id on insert after booking validation. */
export function explorePostSourceBookingIdForInsert(
  validatedBookingId: string | null | undefined,
): string | null {
  if (validatedBookingId == null || validatedBookingId === "") return null;
  return validatedBookingId;
}

export type LinkedExplorePostSummary = { id: string; status: "draft" | "published" } | null;

/** Pick linked post for a booking: published wins over draft, then newest created_at. */
export function pickLinkedExplorePostForBooking(
  rows: Array<{ id: string; status: string; created_at?: string }>,
): LinkedExplorePostSummary {
  if (!rows.length) return null;
  const sorted = [...rows].sort((a, b) => {
    const pubA = a.status === "published" ? 1 : 0;
    const pubB = b.status === "published" ? 1 : 0;
    if (pubB !== pubA) return pubB - pubA;
    const ta = a.created_at ? Date.parse(a.created_at) : 0;
    const tb = b.created_at ? Date.parse(b.created_at) : 0;
    return tb - ta;
  });
  const top = sorted[0]!;
  return {
    id: top.id,
    status: top.status === "published" ? "published" : "draft",
  };
}
