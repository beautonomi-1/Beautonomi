-- 677: product_order_items.product_id was NOT NULL with ON DELETE SET NULL — impossible combo.
--
-- When a provider owner's products are removed (user purge / provider CASCADE), Postgres
-- tries SET NULL on product_order_items.product_id and fails NOT NULL. That surfaced as:
--   Auth delete would fail: Failing row contains (..., null, Milan I cream, ...)
--
-- Fix: allow NULL (denormalized product_name/image remain on the line item).
-- Migration 676 (updated) also deletes provider product_order_items in pass 1 before cascade.
-- If 676 was applied before that line existed, re-run the compliance_clear_user_references
-- section from 676_compliance_purge_auth_delete_probe.sql after this migration.

ALTER TABLE public.product_order_items
  ALTER COLUMN product_id DROP NOT NULL;

COMMENT ON COLUMN public.product_order_items.product_id IS
  'Snapshot catalog link; nullable because ON DELETE SET NULL preserves line items with product_name when the product row is removed.';
