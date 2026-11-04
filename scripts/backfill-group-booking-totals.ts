/**
 * One-off: set group_bookings.total_price for online groups missing totals.
 * Usage: pnpm exec tsx scripts/backfill-group-booking-totals.ts
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  const { tryRecalculateGroupBookingTotal } = await import(
    "../apps/web/src/lib/bookings/recalculate-group-total"
  );

  const { data: groups, error } = await admin
    .from("group_bookings")
    .select("id, primary_contact_booking_id, total_price")
    .or("total_price.is.null,total_price.eq.0");

  if (error) throw error;

  let updated = 0;
  for (const g of groups ?? []) {
    const { data: booking } = await admin
      .from("bookings")
      .select("booking_source")
      .eq("id", g.primary_contact_booking_id)
      .maybeSingle();
    if ((booking as { booking_source?: string } | null)?.booking_source !== "online") continue;
    await tryRecalculateGroupBookingTotal(admin, g.id);
    updated += 1;
  }
  console.log(`Recalculated ${updated} online group booking totals`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
