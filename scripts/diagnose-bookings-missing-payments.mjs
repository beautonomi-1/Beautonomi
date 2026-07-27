#!/usr/bin/env node
/**
 * Read-only diagnostic: bookings marked paid but missing booking_payments rows.
 * Common cause: invalid payment_provider "manual" at provider booking creation (pre-fix).
 *
 * Usage: node scripts/diagnose-bookings-missing-payments.mjs [--limit=50]
 */
import { createClient } from "@supabase/supabase-js";

const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : 50;

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const { data: bookings, error: bErr } = await supabase
  .from("bookings")
  .select("id, booking_number, payment_status, total_amount, total_paid, created_at")
  .gt("total_amount", 0)
  .in("payment_status", ["paid", "partially_paid", "completed"])
  .order("created_at", { ascending: false })
  .limit(Math.max(limit * 3, 50));

if (bErr) {
  console.error(bErr);
  process.exit(1);
}

const suspects = [];
for (const b of bookings ?? []) {
  const { count } = await supabase
    .from("booking_payments")
    .select("id", { count: "exact", head: true })
    .eq("booking_id", b.id);
  if ((count ?? 0) === 0) suspects.push(b);
  if (suspects.length >= limit) break;
}

console.log(JSON.stringify({ count: suspects.length, bookings: suspects }, null, 2));
