/**
 * One-off: post missing finance ledger rows for group guest share booking_payments.
 * Default: dry-run. Pass --live to write.
 *
 *   npx tsx scripts/backfill-group-guest-share-ledger.ts
 *   npx tsx scripts/backfill-group-guest-share-ledger.ts --live
 */
import { createClient } from "@supabase/supabase-js";
import { recordPaystackBookingSettlement } from "../apps/web/src/lib/bookings/record-paystack-booking-settlement";
import { recordFlutterwaveBookingSettlement } from "../apps/web/src/lib/bookings/record-flutterwave-booking-settlement";
import { GROUP_GUEST_PAYMENT_SOURCE } from "../apps/web/src/lib/bookings/group-guest-refunds";

const live = process.argv.includes("--live");

async function main() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  const admin = createClient(url, key, { auth: { persistSession: false } });

  const { data: rows, error } = await admin
    .from("booking_payments")
    .select("id, booking_id, amount, payment_provider, payment_provider_id, payment_provider_data")
    .eq("status", "completed")
    .filter("payment_provider_data->>source", "eq", GROUP_GUEST_PAYMENT_SOURCE);

  if (error) throw error;

  let posted = 0;
  for (const row of rows ?? []) {
    const bp = row as {
      id: string;
      booking_id: string;
      amount: number;
      payment_provider: string;
      payment_provider_id: string | null;
      payment_provider_data?: { gateway?: string } | null;
    };
    const { data: ledger } = await admin
      .from("finance_transactions")
      .select("id")
      .eq("booking_id", bp.booking_id)
      .eq("transaction_type", "payment")
      .eq("source_payment_id", bp.id)
      .maybeSingle();
    if (ledger) continue;

    const gateway = (bp.payment_provider_data?.gateway ?? bp.payment_provider ?? "paystack").toLowerCase();
    const reference = bp.payment_provider_id?.trim();
    if (!reference) continue;
    const amountMajor = Number(bp.amount ?? 0);

    console.log(`${live ? "POST" : "DRY"} guest share`, bp.id, gateway, amountMajor);

    if (!live) continue;

    if (gateway === "flutterwave") {
      const res = await recordFlutterwaveBookingSettlement(admin, {
        bookingId: bp.booking_id,
        reference,
        transactionId: reference,
        amountMajor,
        bookingPaymentId: bp.id,
        isDeposit: false,
      });
      if (res.ok) posted += 1;
      else console.warn("flutterwave backfill failed", bp.id, res.reason);
      continue;
    }

    const res = await recordPaystackBookingSettlement(admin, {
      bookingId: bp.booking_id,
      reference,
      amountMajor,
      bookingPaymentId: bp.id,
      isDeposit: false,
      metadata: { source: "backfill_group_guest_share" },
    });
    if (res.ok) posted += 1;
    else console.warn("paystack backfill failed", bp.id, res.reason);
  }

  console.log(`Done. ${posted} ledger rows posted (${live ? "live" : "dry-run"}).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
