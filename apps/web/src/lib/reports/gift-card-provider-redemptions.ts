import type { SupabaseClient } from "@supabase/supabase-js";
import { subDays } from "date-fns";
import { dateRangeBoundsUtc, formatDateYmd, nowInTz } from "@/lib/dates/provider-tz";
import { fetchAllPaged, fetchInIdChunks } from "@/lib/provider-ops/postgrest-unbounded";

export const MAX_GIFT_CARD_REDEMPTION_ROWS = 50_000;

export type ProviderGiftCardRedemptionRow = {
  id: string;
  gift_card_id: string;
  booking_id: string;
  amount: number;
  currency: string | null;
  captured_at: string;
  gift_card_code: string | null;
  booking_number: string | null;
  scheduled_at: string | null;
};

export function giftCardCapturePeriodBounds(
  period: string,
  timezone: string,
): { fromDate: Date; toDate: Date; fromYmd: string; toYmd: string } {
  const todayYmd = formatDateYmd(new Date(), timezone);
  const now = nowInTz(timezone);
  let fromYmd = todayYmd;
  const toYmd = todayYmd;

  if (period === "all") {
    fromYmd = "1970-01-01";
  } else if (period === "today") {
    fromYmd = todayYmd;
  } else if (period === "week") {
    fromYmd = formatDateYmd(subDays(now, 6), timezone);
  } else if (period === "month") {
    fromYmd = formatDateYmd(subDays(now, 29), timezone);
  } else {
    fromYmd = formatDateYmd(subDays(now, 29), timezone);
  }

  const { fromIso, toIso } = dateRangeBoundsUtc(fromYmd, toYmd, timezone);
  return {
    fromDate: new Date(fromIso),
    toDate: new Date(toIso),
    fromYmd,
    toYmd,
  };
}

type RawRedemption = {
  id: string;
  gift_card_id: string;
  booking_id: string;
  amount?: number | null;
  currency?: string | null;
  captured_at: string;
};

type BookingRow = {
  id: string;
  gift_card_id: string | null;
  booking_number?: string | null;
  ref_number?: string | null;
  scheduled_at?: string | null;
  location_id?: string | null;
};

export async function fetchProviderGiftCardRedemptions(
  supabase: SupabaseClient,
  opts: {
    providerId: string;
    fromDate: Date;
    toDate: Date;
    locationId?: string | null;
  },
): Promise<{ rows: ProviderGiftCardRedemptionRow[]; truncated: boolean }> {
  const fromIso = opts.fromDate.toISOString();
  const toIso = opts.toDate.toISOString();

  let raw: RawRedemption[] = [];
  try {
    raw = await fetchAllPaged<RawRedemption>(async (from, to) => {
      const { data, error } = await supabase
        .from("gift_card_redemptions")
        .select("id, gift_card_id, booking_id, amount, currency, status, captured_at")
        .eq("status", "captured")
        .not("captured_at", "is", null)
        .gte("captured_at", fromIso)
        .lte("captured_at", toIso)
        .order("captured_at", { ascending: false })
        .range(from, to);
      return { data, error };
    }, MAX_GIFT_CARD_REDEMPTION_ROWS);
  } catch {
    return { rows: [], truncated: false };
  }

  const truncated = raw.length >= MAX_GIFT_CARD_REDEMPTION_ROWS;
  const bookingIds = [...new Set(raw.map((r) => r.booking_id).filter(Boolean))];
  if (bookingIds.length === 0) {
    return { rows: [], truncated };
  }

  const bookings = await fetchInIdChunks<BookingRow>(
    bookingIds,
    (slice) =>
      supabase
        .from("bookings")
        .select("id, gift_card_id, booking_number, ref_number, scheduled_at, location_id")
        .eq("provider_id", opts.providerId)
        .not("gift_card_id", "is", null)
        .in("id", slice),
    { throwOnError: true },
  );

  const bookingMap = new Map<string, BookingRow>();
  for (const b of bookings) {
    if (opts.locationId && b.location_id !== opts.locationId) continue;
    bookingMap.set(b.id, b);
  }

  const filtered = raw.filter((r) => bookingMap.has(r.booking_id));
  const giftCardIds = [...new Set(filtered.map((r) => r.gift_card_id).filter(Boolean))];
  const giftCards = await fetchInIdChunks<{ id: string; code?: string | null }>(
    giftCardIds,
    (slice) => supabase.from("gift_cards").select("id, code").in("id", slice),
    { throwOnError: false },
  );
  const codeMap = new Map(giftCards.map((g) => [g.id, g.code ?? null]));

  const rows: ProviderGiftCardRedemptionRow[] = filtered.map((r) => {
    const booking = bookingMap.get(r.booking_id);
    return {
      id: r.id,
      gift_card_id: r.gift_card_id,
      booking_id: r.booking_id,
      amount: Number(r.amount ?? 0),
      currency: r.currency ?? null,
      captured_at: r.captured_at,
      gift_card_code: codeMap.get(r.gift_card_id) ?? null,
      booking_number: booking?.ref_number ?? booking?.booking_number ?? null,
      scheduled_at: booking?.scheduled_at ?? null,
    };
  });

  return { rows, truncated };
}

export function giftCardRedemptionReportBasis(
  fromYmd: string,
  toYmd: string,
  timezone: string,
  truncated: boolean,
): string {
  let basis =
    `Capture dates ${fromYmd}–${toYmd} (${timezone}). ` +
    "Each row is a gift card amount captured at your business — not cards your salon sold.";
  if (truncated) {
    basis += " Older captures may be missing from this list.";
  }
  return basis;
}
