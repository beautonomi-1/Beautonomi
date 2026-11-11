-- Any active staff member of a salon can read product_suppliers, including
-- email and phone. Drop the table read for anon and authenticated, then
-- grant every other column. The contact name stays. INSERT and UPDATE stay,
-- so a supplier can still be saved with an address. The supplier screens
-- keep the original table read after the product permission check.

REVOKE SELECT ON TABLE public.product_suppliers FROM PUBLIC, anon, authenticated;

GRANT SELECT (
  id,
  provider_id,
  name,
  contact_name,
  address,
  website,
  notes,
  category,
  status,
  created_at,
  updated_at
) ON TABLE public.product_suppliers TO anon, authenticated;
