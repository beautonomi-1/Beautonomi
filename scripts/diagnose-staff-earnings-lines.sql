-- Diagnose staff_earnings_lines drift vs provider_earnings/tips and assignments.
-- Run in Supabase SQL editor (read-only checks).

-- 1) Bookings with provider_earnings FT and assigned staff but no commission lines
SELECT b.id AS booking_id,
       b.booking_number,
       ft.id AS finance_transaction_id,
       ft.amount AS provider_earnings_amount,
       COUNT(DISTINCT bs.staff_id) AS assigned_staff_count,
       COUNT(sel.id) AS staff_lines
FROM bookings b
JOIN finance_transactions ft ON ft.booking_id = b.id AND ft.transaction_type = 'provider_earnings'
JOIN booking_services bs ON bs.booking_id = b.id AND bs.staff_id IS NOT NULL
LEFT JOIN staff_earnings_lines sel ON sel.source_finance_transaction_id = ft.id AND sel.kind = 'commission'
GROUP BY b.id, b.booking_number, ft.id, ft.amount
HAVING COUNT(sel.id) = 0
ORDER BY ft.created_at DESC
LIMIT 50;

-- 2) Lines whose staff belongs to another provider
SELECT sel.id, sel.staff_id, sel.provider_id AS line_provider_id, ps.provider_id AS staff_provider_id
FROM staff_earnings_lines sel
JOIN provider_staff ps ON ps.id = sel.staff_id
WHERE sel.provider_id <> ps.provider_id
LIMIT 50;

-- 3) Tip FT with distribute_to_staff but no tip lines
SELECT ft.id, ft.booking_id, ft.amount
FROM finance_transactions ft
JOIN provider_tip_settings pts ON pts.provider_id = ft.provider_id AND pts.distribute_to_staff = true
WHERE ft.transaction_type = 'tip' AND ft.amount > 0
  AND NOT EXISTS (
    SELECT 1 FROM staff_earnings_lines sel
    WHERE sel.source_finance_transaction_id = ft.id AND sel.kind = 'tip'
  )
ORDER BY ft.created_at DESC
LIMIT 50;

-- 4) Positive tip/commission lines without matching refund clawback after completed refund
SELECT sel.id, sel.booking_id, sel.staff_id, sel.kind, sel.amount AS original_amount
FROM staff_earnings_lines sel
JOIN booking_refunds br ON br.booking_id = sel.booking_id AND br.status = 'completed'
WHERE sel.amount > 0
  AND sel.kind IN ('commission', 'tip')
  AND NOT EXISTS (
    SELECT 1 FROM staff_earnings_lines neg
    JOIN finance_transactions rft ON rft.id = neg.source_finance_transaction_id
    WHERE neg.booking_id = sel.booking_id
      AND neg.staff_id = sel.staff_id
      AND neg.kind = sel.kind
      AND neg.amount < 0
      AND rft.transaction_type = 'refund'
  )
ORDER BY sel.created_at DESC
LIMIT 50;
