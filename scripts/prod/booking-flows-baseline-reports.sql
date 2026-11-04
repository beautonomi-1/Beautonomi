-- Phase 0 baseline reports (read-only). Run against production/staging before migrations 1029+.

-- 1) Duplicate group service lines (online group bookings)
WITH online_group_bookings AS (
  SELECT b.id AS booking_id
  FROM public.bookings b
  WHERE b.booking_source = 'online'
    AND b.group_booking_id IS NOT NULL
),
line_counts AS (
  SELECT
    bs.booking_id,
    bs.offering_id,
    COUNT(*) FILTER (WHERE bs.guest_name IS NULL) AS null_guest_count,
    COUNT(*) FILTER (WHERE bs.guest_name IS NOT NULL) AS named_guest_count
  FROM public.booking_services bs
  INNER JOIN online_group_bookings og ON og.booking_id = bs.booking_id
  GROUP BY bs.booking_id, bs.offering_id
  HAVING COUNT(*) FILTER (WHERE bs.guest_name IS NOT NULL) > 0
     AND COUNT(*) FILTER (WHERE bs.guest_name IS NULL) >= COUNT(*) FILTER (WHERE bs.guest_name IS NOT NULL)
)
SELECT
  lc.*,
  (
    SELECT COUNT(*)
    FROM public.booking_resources br
    INNER JOIN public.booking_services bs2 ON bs2.id = br.booking_service_id
    WHERE bs2.booking_id = lc.booking_id
      AND bs2.offering_id = lc.offering_id
      AND bs2.guest_name IS NOT NULL
  ) AS dup_booking_resources,
  (
    SELECT COUNT(*)
    FROM public.staff_earnings_lines sel
    INNER JOIN public.booking_services bs3 ON bs3.id = sel.booking_service_id
    WHERE bs3.booking_id = lc.booking_id
      AND bs3.offering_id = lc.offering_id
      AND bs3.guest_name IS NOT NULL
  ) AS dup_staff_earnings_lines
FROM line_counts lc;

-- 2) Providers with group_booking_enabled off but staff-created groups exist
SELECT DISTINCT p.id AS provider_id
FROM public.providers p
WHERE p.group_booking_enabled = false
  AND (
    EXISTS (
      SELECT 1 FROM public.group_bookings gb
      WHERE gb.provider_id = p.id AND gb.created_by IS NOT NULL
    )
    OR EXISTS (
      SELECT 1
      FROM public.group_bookings gb
      JOIN public.bookings b ON b.id = gb.primary_contact_booking_id
      WHERE gb.provider_id = p.id AND COALESCE(b.booking_source, '') <> 'online'
    )
  );

-- 3) Booking status transition violations (60 days)
SELECT from_status, to_status, COUNT(*) AS cnt
FROM public.booking_status_transition_violations
WHERE created_at >= NOW() - INTERVAL '60 days'
GROUP BY from_status, to_status
ORDER BY cnt DESC;

-- 4) Online group_bookings with missing/zero total_price
SELECT gb.id, gb.ref_number, gb.total_price, gb.created_at
FROM public.group_bookings gb
JOIN public.bookings b ON b.id = gb.primary_contact_booking_id
WHERE COALESCE(b.booking_source, '') = 'online'
  AND (gb.total_price IS NULL OR gb.total_price = 0);

-- 5) Mislabelled partial product refunds
SELECT id, order_number, total_amount, refunded_amount, payment_status, status
FROM public.product_orders
WHERE payment_status = 'refunded'
  AND refunded_amount > 0
  AND total_amount > 0
  AND refunded_amount < total_amount - 0.01;
