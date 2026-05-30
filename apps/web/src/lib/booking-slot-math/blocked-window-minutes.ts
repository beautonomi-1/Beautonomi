/**
 * Shared slot-span math for **sequential** services on one booking (one staff timeline).
 * Aligns with `validate-booking` non-group `bookingServicesData` assembly:
 * cursor advances by duration + buffer after each line (including after the last service),
 * so the **total blocked minutes** from first start to end of trailing buffer is:
 *   sum(duration) + sum(buffer after each service).
 *
 * Public slug availability and `/api/availability` callers should pass a `duration` that
 * matches this when emulating the same cart.
 */

export type OfferingTimingSlice = {
  durationMinutes: number;
  /** Turnover after this segment (same as `offerings.buffer_minutes`). */
  bufferAfterMinutes: number;
};

/**
 * Total minutes blocked on the calendar for a chain of back-to-back offerings.
 */
export function sumChainedBlockedMinutes(slices: OfferingTimingSlice[]): number {
  if (slices.length === 0) return 0;
  let total = 0;
  for (const s of slices) {
    const d = Math.max(0, Number(s.durationMinutes) || 0);
    const b = Math.max(0, Number(s.bufferAfterMinutes) || 0);
    total += d + b;
  }
  return total;
}

/** Build slices from booking_services join shape used by portal availability. */
export function slicesFromBookingServiceRows(
  rows: Array<{
    duration_minutes?: number | null;
    offerings?: { duration_minutes?: number | null; buffer_minutes?: number | null } | null;
  }>
): OfferingTimingSlice[] {
  return rows.map((bs) => {
    const dur = Number(bs.duration_minutes ?? bs.offerings?.duration_minutes ?? 60);
    const buf = Number(bs.offerings?.buffer_minutes ?? 0);
    return { durationMinutes: dur, bufferAfterMinutes: buf };
  });
}

/** Online cart: offerings in order, then add-ons as extra segments (buffer after add-ons = 0 unless modeled). */
export function slicesFromBookingCart(
  services: Array<{ duration: number; bufferMinutes?: number }>,
  addons: Array<{ duration: number }>
): OfferingTimingSlice[] {
  const out: OfferingTimingSlice[] = [];
  for (const s of services) {
    out.push({
      durationMinutes: Math.max(0, Number(s.duration) || 0),
      bufferAfterMinutes: Math.max(0, Number(s.bufferMinutes) || 0),
    });
  }
  for (const a of addons) {
    out.push({
      durationMinutes: Math.max(0, Number(a.duration) || 0),
      bufferAfterMinutes: 0,
    });
  }
  return out;
}

/**
 * Public slug route uses `totalSpan = duration_minutes + buffer_minutes` with that split.
 * This decomposition matches {@link sumChainedBlockedMinutes} for the same ordered slices.
 */
export function publicSlugSpanParamsFromSlices(slices: OfferingTimingSlice[]): {
  durationMinutes: number;
  bufferMinutes: number;
} {
  let durationMinutes = 0;
  let bufferMinutes = 0;
  for (const s of slices) {
    durationMinutes += Math.max(0, Number(s.durationMinutes) || 0);
    bufferMinutes += Math.max(0, Number(s.bufferAfterMinutes) || 0);
  }
  return { durationMinutes, bufferMinutes };
}

/**
 * `duration` query param for GET `/api/availability` (salon) — full blocked chain in minutes.
 * Mobile mode passes travel time via that route's `travelBuffer` param separately.
 */
export function availabilityRouteDurationMinutes(slices: OfferingTimingSlice[]): number {
  return sumChainedBlockedMinutes(slices);
}

/**
 * Blocked minutes for hold grid preflight — matches listing `totalBlockedMinutes`
 * (duration + buffers, **no** travel). Travel is passed separately via
 * `travelBufferRaw` on {@link assertPublicSlotBookable}.
 */
export function holdGridDurationMinutesFromSnapshot(args: {
  startAt: Date;
  snapshotLines: Array<{ offering_id: string; scheduled_end_at: string }>;
  bufferMinutesByOfferingId: Map<string, number>;
}): number {
  const last = args.snapshotLines[args.snapshotLines.length - 1];
  if (!last) return 60;
  const lastBuf = args.bufferMinutesByOfferingId.get(last.offering_id) ?? 0;
  const lastEndMs = new Date(last.scheduled_end_at).getTime() + lastBuf * 60000;
  const dur = Math.round((lastEndMs - args.startAt.getTime()) / 60000);
  return Math.max(15, Math.min(480, dur));
}
