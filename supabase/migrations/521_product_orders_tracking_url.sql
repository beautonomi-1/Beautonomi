-- Add tracking_url column so providers can record the carrier's tracking page
-- and customers can deep-link to the shipment without us building per-carrier
-- URL templates.
--
-- §Customer-audit 2026-04 (follow-up): previously the customer PDP / order
-- detail only showed `tracking_number` as plain text. Providers had no way
-- to expose a tappable link, so customers would have to copy/paste the
-- number into the carrier's website manually. Adding the column lets the
-- provider web + mobile UIs capture a URL at "shipped" time, and the
-- customer mobile / web UIs can render it as a tappable link.
--
-- Keeping this additive-only (nullable TEXT, no backfill) so existing orders
-- continue to work unchanged.

ALTER TABLE product_orders
  ADD COLUMN IF NOT EXISTS tracking_url TEXT;

COMMENT ON COLUMN product_orders.tracking_url IS
  'Optional carrier tracking URL. When set, customer surfaces render it as a tappable link instead of (or alongside) tracking_number.';
