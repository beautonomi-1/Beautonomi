const fs = require("fs");
const path = require("path");
const src = path.join(__dirname, "../supabase/migrations/654_refund_trigger_full_component_reversal.sql");
const dst = path.join(__dirname, "../supabase/migrations/669_refund_ratio_use_gross_total.sql");
let s = fs.readFileSync(src, "utf8");
s = s.replace("-- 654:", "-- 669: refund ratio gross total (patched from 654)");
s = s.replace(
  "SELECT id, provider_id, tenant_id, booking_number, COALESCE(total_amount, 0) AS total_amount",
  "SELECT id, provider_id, tenant_id, booking_number, COALESCE(total_amount, 0) AS total_amount, COALESCE(cancellation_fee, 0) AS cancellation_fee, COALESCE(total_paid, 0) AS total_paid, COALESCE(total_refunded, 0) AS total_refunded",
);
s = s.replace(
  "v_total := GREATEST(v_booking.total_amount, 0.01);",
  "v_total := GREATEST(COALESCE(v_booking.total_amount, 0) + COALESCE(v_booking.cancellation_fee, 0), COALESCE(v_booking.total_paid, 0) + COALESCE(v_booking.total_refunded, 0), 0.01);",
);
fs.writeFileSync(dst, s);
console.log("Wrote", dst);
