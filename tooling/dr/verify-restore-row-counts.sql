-- Post-restore row-count checks for Supabase PITR drills.
-- Invoked by tooling/dr/verify-restore-row-counts.mjs (psql) or run manually in SQL editor.

SELECT 'users', COUNT(*)::bigint FROM users
UNION ALL SELECT 'providers', COUNT(*)::bigint FROM providers
UNION ALL SELECT 'bookings', COUNT(*)::bigint FROM bookings
UNION ALL SELECT 'booking_payments', COUNT(*)::bigint FROM booking_payments
UNION ALL SELECT 'finance_transactions', COUNT(*)::bigint FROM finance_transactions
UNION ALL SELECT 'notification_delivery_queue', COUNT(*)::bigint FROM notification_delivery_queue
UNION ALL SELECT 'feature_flags', COUNT(*)::bigint FROM feature_flags;
