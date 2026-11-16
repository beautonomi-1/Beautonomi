-- Read-only staging finance accuracy audit.
-- The runner replaces __AS_OF__ with a timestamptz literal frozen at the start.
-- SELECT only. Do not add INSERT, UPDATE, DELETE, or self-heal calls.

WITH params AS (
  SELECT timestamptz '__AS_OF__' AS as_of
),
checks AS (
  SELECT * FROM (
    SELECT 'existing.duplicate_source_payment_rows'::text AS check_id,
           'ledger'::text AS domain,
           (SELECT count(*)::int FROM public.finance_audit_run('duplicate_source_payment_rows')) AS violations,
           (SELECT COALESCE(string_agg(left(x::text, 180), ' | '), '')
              FROM (SELECT x FROM public.finance_audit_run('duplicate_source_payment_rows') AS x LIMIT 10) s) AS samples

    UNION ALL
    SELECT 'existing.completed_refunds_without_ledger', 'refunds',
           (SELECT count(*)::int FROM public.finance_audit_run('completed_refunds_without_ledger')),
           (SELECT COALESCE(string_agg(left(x::text, 180), ' | '), '')
              FROM (SELECT x FROM public.finance_audit_run('completed_refunds_without_ledger') AS x LIMIT 10) s)

    UNION ALL
    SELECT 'existing.paid_product_orders_missing_ledger', 'product_orders',
           (SELECT count(*)::int FROM public.finance_audit_run('paid_product_orders_missing_ledger')),
           (SELECT COALESCE(string_agg(left(x::text, 180), ' | '), '')
              FROM (SELECT x FROM public.finance_audit_run('paid_product_orders_missing_ledger') AS x LIMIT 10) s)

    UNION ALL
    SELECT 'existing.booking_component_drift', 'bookings',
           (SELECT count(*)::int FROM public.reconciliation_booking_component_drift(0.004)),
           (SELECT COALESCE(string_agg(booking_id::text || ':' || component, ','), '')
              FROM (SELECT booking_id, component FROM public.reconciliation_booking_component_drift(0.004) LIMIT 10) s)

    UNION ALL
    SELECT 'existing.orphan_refund_rows', 'refunds',
           (SELECT count(*)::int FROM public.reconciliation_orphan_refund_rows()),
           (SELECT COALESCE(string_agg(finance_tx_id::text, ','), '')
              FROM (SELECT finance_tx_id FROM public.reconciliation_orphan_refund_rows() LIMIT 10) s)

    UNION ALL
    SELECT 'existing.shadow_gl_missing_rows', 'ledger',
           COALESCE((SELECT missing_row_count::int FROM public.ledger_reconciliation_summary('-infinity'::timestamptz, (SELECT as_of + interval '1 second' FROM params))), 0),
           ''

    UNION ALL
    SELECT 'existing.shadow_gl_imbalanced', 'ledger',
           COALESCE((SELECT imbalanced_entry_count::int FROM public.ledger_reconciliation_summary('-infinity'::timestamptz, (SELECT as_of + interval '1 second' FROM params))), 0),
           ''

    UNION ALL
    SELECT 'existing.shadow_gl_debit_credit_drift_cents', 'ledger',
           COALESCE((SELECT round(abs(ledger_sum_debits - ledger_sum_credits) * 100)::int
                        FROM public.ledger_reconciliation_summary('-infinity'::timestamptz, (SELECT as_of + interval '1 second' FROM params))), 0),
           ''

    UNION ALL
    SELECT 'existing.online_payments_missing_ledger', 'payments',
           (
             (SELECT count(*)::int FROM public.list_online_booking_payments_missing_ledger('paystack', (SELECT as_of FROM params), 200, NULL))
             + (SELECT count(*)::int FROM public.list_online_booking_payments_missing_ledger('stripe', (SELECT as_of FROM params), 200, NULL))
             + (SELECT count(*)::int FROM public.list_online_booking_payments_missing_ledger('flutterwave', (SELECT as_of FROM params), 200, NULL))
           ),
           ''

    UNION ALL
    SELECT 'existing.payments_missing_provider_earnings', 'bookings',
           (SELECT count(*)::int FROM public.list_booking_payments_missing_provider_earnings(NULL, 200)),
           (SELECT COALESCE(string_agg(booking_id::text, ','), '')
              FROM (SELECT booking_id FROM public.list_booking_payments_missing_provider_earnings(NULL, 200) LIMIT 10) s)

    UNION ALL
    SELECT 'existing.overcharged_inclusive_bookings', 'bookings',
           (SELECT count(*)::int FROM public.list_integrity_overcharged_inclusive_bookings(NULL, 200)), ''
    UNION ALL
    SELECT 'existing.vat_debited_on_refunds', 'refunds',
           (SELECT count(*)::int FROM public.list_integrity_vat_debited_on_refunds(NULL, 200)), ''
    UNION ALL
    SELECT 'existing.deposit_tax_leak', 'bookings',
           (SELECT count(*)::int FROM public.list_integrity_deposit_tax_leak(NULL, 200)), ''
    UNION ALL
    SELECT 'existing.orphan_payout_ledger_rows', 'payouts',
           (SELECT count(*)::int FROM public.list_integrity_orphan_payout_ledger_rows(NULL, 200)), ''
    UNION ALL
    SELECT 'existing.completed_payouts_without_ledger', 'payouts',
           (SELECT count(*)::int FROM public.list_integrity_completed_payouts_without_ledger(NULL, 200)), ''
    UNION ALL
    SELECT 'existing.vat_settings_violations', 'tax',
           (SELECT count(*)::int FROM public.list_integrity_vat_settings_violations(NULL, 200)),
           (SELECT COALESCE(string_agg(provider_id::text, ','), '')
              FROM (SELECT provider_id FROM public.list_integrity_vat_settings_violations(NULL, 200) LIMIT 10) s)
    UNION ALL
    SELECT 'existing.charged_vat_without_registration', 'tax',
           (SELECT count(*)::int FROM public.list_integrity_charged_vat_without_registration(NULL, 200)),
           (SELECT COALESCE(string_agg(booking_id::text, ','), '')
              FROM (SELECT booking_id FROM public.list_integrity_charged_vat_without_registration(NULL, 200) LIMIT 10) s)
    UNION ALL
    SELECT 'existing.tax_rate_display_defects', 'tax',
           (SELECT count(*)::int FROM public.list_integrity_tax_rate_display_defects(NULL, 200)), ''
    UNION ALL
    SELECT 'existing.tax_rate_data_quality', 'tax',
           (SELECT count(*)::int FROM public.list_integrity_tax_rate_data_quality(NULL, 200)), ''
    UNION ALL
    SELECT 'existing.paid_wallet_topups_missing_ledger', 'wallet',
           (SELECT count(*)::int FROM public.list_integrity_paid_wallet_topups_missing_ledger(NULL, 200)), ''

    UNION ALL
    SELECT 'existing.refund_rows_without_source_refund_id', 'refunds',
           (SELECT count(*)::int FROM public.finance_transactions
             WHERE transaction_type = 'refund' AND source_refund_id IS NULL AND created_at <= (SELECT as_of FROM params)),
           (SELECT COALESCE(string_agg(id::text, ','), '')
              FROM (SELECT id FROM public.finance_transactions
                     WHERE transaction_type = 'refund' AND source_refund_id IS NULL
                       AND created_at <= (SELECT as_of FROM params)
                     LIMIT 10) s)

    UNION ALL
    SELECT 'existing.unsettled_cancellations_with_money', 'bookings',
           (SELECT count(*)::int FROM public.bookings b
             WHERE b.status::text IN ('cancelled', 'no_show')
               AND b.cancellation_settled_at IS NULL
               AND b.created_at <= (SELECT as_of FROM params)
               AND (COALESCE(b.total_paid, 0) > 0 OR COALESCE(b.wallet_amount, 0) > 0 OR COALESCE(b.gift_card_amount, 0) > 0)),
           (SELECT COALESCE(string_agg(id::text, ','), '')
              FROM (SELECT id FROM public.bookings b
                     WHERE b.status::text IN ('cancelled', 'no_show')
                       AND b.cancellation_settled_at IS NULL
                       AND b.created_at <= (SELECT as_of FROM params)
                       AND (COALESCE(b.total_paid, 0) > 0 OR COALESCE(b.wallet_amount, 0) > 0 OR COALESCE(b.gift_card_amount, 0) > 0)
                     LIMIT 10) s)

    UNION ALL
    SELECT 'existing.unfinalized_reschedule_credits', 'bookings',
           (SELECT count(*)::int FROM public.bookings b
             WHERE b.rescheduled_from_booking_id IS NOT NULL
               AND b.reschedule_carry_over_finalized_at IS NULL
               AND b.payment_status::text IN ('paid', 'partially_paid')
               AND b.created_at <= (SELECT as_of FROM params)),
           (SELECT COALESCE(string_agg(id::text, ','), '')
              FROM (SELECT id FROM public.bookings b
                     WHERE b.rescheduled_from_booking_id IS NOT NULL
                       AND b.reschedule_carry_over_finalized_at IS NULL
                       AND b.payment_status::text IN ('paid', 'partially_paid')
                       AND b.created_at <= (SELECT as_of FROM params)
                     LIMIT 10) s)

    UNION ALL
    SELECT 'hygiene.null_tenant_rows', 'tenants',
           (
             (SELECT count(*) FROM public.bookings WHERE tenant_id IS NULL)
             + (SELECT count(*) FROM public.finance_transactions WHERE tenant_id IS NULL)
             + (SELECT count(*) FROM public.membership_orders WHERE tenant_id IS NULL)
             + (SELECT count(*) FROM public.product_orders WHERE tenant_id IS NULL)
             + (SELECT count(*) FROM public.provider_subscriptions WHERE tenant_id IS NULL)
             + (SELECT count(*) FROM public.wallet_transactions WHERE tenant_id IS NULL)
             + (SELECT count(*) FROM public.gift_card_orders WHERE tenant_id IS NULL)
             + (SELECT count(*) FROM public.booking_payments WHERE tenant_id IS NULL)
             + (SELECT count(*) FROM public.payment_webhook_events WHERE tenant_id IS NULL)
           )::int,
           ''

    UNION ALL
    SELECT 'hygiene.ledger_tenant_mismatch', 'tenants',
           (SELECT count(*)::int FROM public.finance_transactions ft
              JOIN public.bookings b ON b.id = ft.booking_id
             WHERE ft.created_at <= (SELECT as_of FROM params)
               AND ft.tenant_id IS DISTINCT FROM b.tenant_id),
           (SELECT COALESCE(string_agg(id::text, ','), '')
              FROM (SELECT ft.id FROM public.finance_transactions ft
                      JOIN public.bookings b ON b.id = ft.booking_id
                     WHERE ft.created_at <= (SELECT as_of FROM params)
                       AND ft.tenant_id IS DISTINCT FROM b.tenant_id
                     LIMIT 10) s)

    UNION ALL
    SELECT 'payments.completed_without_exactly_one_payment_leg', 'payments',
           (SELECT count(*)::int FROM public.booking_payments bp
             WHERE bp.status = 'completed'
               AND bp.created_at <= (SELECT as_of FROM params)
               AND (
                 SELECT count(*) FROM public.finance_transactions ft
                  WHERE ft.source_payment_id = bp.id AND ft.transaction_type = 'payment'
               ) <> 1),
           (SELECT COALESCE(string_agg(id::text, ','), '')
              FROM (SELECT bp.id FROM public.booking_payments bp
                     WHERE bp.status = 'completed'
                       AND bp.created_at <= (SELECT as_of FROM params)
                       AND (SELECT count(*) FROM public.finance_transactions ft
                             WHERE ft.source_payment_id = bp.id AND ft.transaction_type = 'payment') <> 1
                     LIMIT 10) s)

    UNION ALL
    SELECT 'payments.failed_or_pending_with_payment_leg', 'payments',
           (SELECT count(*)::int FROM public.booking_payments bp
             WHERE bp.status IN ('failed', 'pending')
               AND bp.created_at <= (SELECT as_of FROM params)
               AND EXISTS (
                 SELECT 1 FROM public.finance_transactions ft
                  WHERE ft.source_payment_id = bp.id AND ft.transaction_type = 'payment'
               )),
           (SELECT COALESCE(string_agg(id::text, ','), '')
              FROM (SELECT bp.id FROM public.booking_payments bp
                     WHERE bp.status IN ('failed', 'pending')
                       AND bp.created_at <= (SELECT as_of FROM params)
                       AND EXISTS (
                         SELECT 1 FROM public.finance_transactions ft
                          WHERE ft.source_payment_id = bp.id AND ft.transaction_type = 'payment'
                       )
                     LIMIT 10) s)

    UNION ALL
    SELECT 'payments.successful_gateway_row_without_booking', 'payments',
           (SELECT count(*)::int FROM public.payment_transactions pt
             WHERE pt.created_at <= (SELECT as_of FROM params)
               AND pt.status IN ('success', 'successful', 'paid', 'completed', 'succeeded')
               AND pt.booking_id IS NULL
               AND COALESCE(pt.transaction_type, 'charge') NOT IN ('wallet_topup', 'provider_subscription_payment')),
           (SELECT COALESCE(string_agg(id::text, ','), '')
              FROM (SELECT pt.id FROM public.payment_transactions pt
                     WHERE pt.created_at <= (SELECT as_of FROM params)
                       AND pt.status IN ('success', 'successful', 'paid', 'completed', 'succeeded')
                       AND pt.booking_id IS NULL
                       AND COALESCE(pt.transaction_type, 'charge') NOT IN ('wallet_topup', 'provider_subscription_payment')
                     LIMIT 10) s)

    UNION ALL
    SELECT 'bookings.paid_column_vs_completed_payments', 'bookings',
           (SELECT count(*)::int FROM public.bookings b
             WHERE b.created_at <= (SELECT as_of FROM params)
               AND abs(COALESCE(b.total_paid, 0) - COALESCE((
                     SELECT SUM(bp.amount) FROM public.booking_payments bp
                      WHERE bp.booking_id = b.id AND bp.status = 'completed'
                        AND bp.created_at <= (SELECT as_of FROM params)
                   ), 0)) > 0.005),
           (SELECT COALESCE(string_agg(id::text, ','), '')
              FROM (SELECT b.id FROM public.bookings b
                     WHERE b.created_at <= (SELECT as_of FROM params)
                       AND abs(COALESCE(b.total_paid, 0) - COALESCE((
                             SELECT SUM(bp.amount) FROM public.booking_payments bp
                              WHERE bp.booking_id = b.id AND bp.status = 'completed'
                                AND bp.created_at <= (SELECT as_of FROM params)
                           ), 0)) > 0.005
                     LIMIT 10) s)

    UNION ALL
    SELECT 'bookings.refunded_column_vs_completed_refunds', 'bookings',
           (SELECT count(*)::int FROM public.bookings b
             WHERE b.created_at <= (SELECT as_of FROM params)
               AND abs(COALESCE(b.total_refunded, 0) - COALESCE((
                     SELECT SUM(br.amount) FROM public.booking_refunds br
                      WHERE br.booking_id = b.id AND br.status = 'completed'
                        AND br.created_at <= (SELECT as_of FROM params)
                   ), 0)) > 0.005),
           (SELECT COALESCE(string_agg(id::text, ','), '')
              FROM (SELECT b.id FROM public.bookings b
                     WHERE b.created_at <= (SELECT as_of FROM params)
                       AND abs(COALESCE(b.total_refunded, 0) - COALESCE((
                             SELECT SUM(br.amount) FROM public.booking_refunds br
                              WHERE br.booking_id = b.id AND br.status = 'completed'
                                AND br.created_at <= (SELECT as_of FROM params)
                           ), 0)) > 0.005
                     LIMIT 10) s)

    UNION ALL
    SELECT 'bookings.refund_exceeds_paid', 'refunds',
           (SELECT count(*)::int FROM public.bookings b
             WHERE b.created_at <= (SELECT as_of FROM params)
               AND COALESCE(b.total_refunded, 0) > COALESCE(b.total_paid, 0) + 0.005),
           (SELECT COALESCE(string_agg(id::text, ','), '')
              FROM (SELECT b.id FROM public.bookings b
                     WHERE b.created_at <= (SELECT as_of FROM params)
                       AND COALESCE(b.total_refunded, 0) > COALESCE(b.total_paid, 0) + 0.005
                     LIMIT 10) s)

    UNION ALL
    SELECT 'bookings.impossible_status_combo', 'bookings',
           (SELECT count(*)::int FROM public.bookings b
             WHERE b.created_at <= (SELECT as_of FROM params)
               AND (
                 (b.status::text IN ('pending', 'confirmed') AND b.payment_status::text IN ('refunded'))
                 OR (b.payment_status::text = 'paid' AND COALESCE(b.total_paid, 0) <= 0)
                 OR (b.payment_status::text IN ('refunded', 'partially_refunded') AND COALESCE(b.total_refunded, 0) <= 0)
                 OR (b.payment_status::text = 'pending' AND COALESCE(b.total_paid, 0) > 0.005)
                 OR (b.payment_status::text = 'failed' AND COALESCE(b.total_paid, 0) > 0.005)
               )),
           (SELECT COALESCE(string_agg(id::text, ','), '')
              FROM (SELECT b.id FROM public.bookings b
                     WHERE b.created_at <= (SELECT as_of FROM params)
                       AND (
                         (b.status::text IN ('pending', 'confirmed') AND b.payment_status::text IN ('refunded'))
                         OR (b.payment_status::text = 'paid' AND COALESCE(b.total_paid, 0) <= 0)
                         OR (b.payment_status::text IN ('refunded', 'partially_refunded') AND COALESCE(b.total_refunded, 0) <= 0)
                         OR (b.payment_status::text = 'pending' AND COALESCE(b.total_paid, 0) > 0.005)
                         OR (b.payment_status::text = 'failed' AND COALESCE(b.total_paid, 0) > 0.005)
                       )
                     LIMIT 10) s)

    UNION ALL
    SELECT 'bookings.cancelled_money_not_refunded_or_fee', 'bookings',
           (SELECT count(*)::int FROM public.bookings b
             WHERE b.created_at <= (SELECT as_of FROM params)
               AND b.status::text IN ('cancelled', 'no_show', 'declined')
               AND COALESCE(b.total_paid, 0) > COALESCE(b.total_refunded, 0) + COALESCE(b.cancellation_fee, 0) + 0.005),
           (SELECT COALESCE(string_agg(id::text, ','), '')
              FROM (SELECT b.id FROM public.bookings b
                     WHERE b.created_at <= (SELECT as_of FROM params)
                       AND b.status::text IN ('cancelled', 'no_show', 'declined')
                       AND COALESCE(b.total_paid, 0) > COALESCE(b.total_refunded, 0) + COALESCE(b.cancellation_fee, 0) + 0.005
                     LIMIT 10) s)

    UNION ALL
    SELECT 'bookings.reschedule_both_sides_still_paid', 'bookings',
           (SELECT count(*)::int FROM public.bookings b
              JOIN public.bookings src ON src.id = b.rescheduled_from_booking_id
             WHERE b.created_at <= (SELECT as_of FROM params)
               AND COALESCE(b.total_paid, 0) > 0.005
               AND COALESCE(src.total_paid, 0) > COALESCE(src.total_refunded, 0) + 0.005),
           (SELECT COALESCE(string_agg(b.id::text, ','), '')
              FROM (SELECT b.id FROM public.bookings b
                      JOIN public.bookings src ON src.id = b.rescheduled_from_booking_id
                     WHERE b.created_at <= (SELECT as_of FROM params)
                       AND COALESCE(b.total_paid, 0) > 0.005
                       AND COALESCE(src.total_paid, 0) > COALESCE(src.total_refunded, 0) + 0.005
                     LIMIT 10) b)

    UNION ALL
    SELECT 'refunds.cash_legs_do_not_match_refund', 'refunds',
           (SELECT count(*)::int FROM public.booking_refunds br
             WHERE br.status = 'completed'
               AND br.created_at <= (SELECT as_of FROM params)
               AND abs(COALESCE((
                     SELECT SUM(ft.amount) FROM public.finance_transactions ft
                      WHERE ft.source_refund_id = br.id
                        AND ft.transaction_type = 'refund'
                        AND COALESCE(ft.refund_component, '') NOT IN (
                          'promotion_discount', 'membership_discount', 'loyalty_redemption', 'loyalty_discount',
                          'wallet_payment', 'gift_card_payment', 'gift_card_liability_reduction'
                        )
                   ), 0) + br.amount) > 0.005
               AND abs(COALESCE((
                     SELECT SUM(ft.net) FROM public.finance_transactions ft
                      WHERE ft.source_refund_id = br.id
                        AND ft.transaction_type = 'refund'
                        AND COALESCE(ft.refund_component, '') NOT IN (
                          'promotion_discount', 'membership_discount', 'loyalty_redemption', 'loyalty_discount',
                          'wallet_payment', 'gift_card_payment', 'gift_card_liability_reduction'
                        )
                   ), 0) + br.amount) > 0.005),
           (SELECT COALESCE(string_agg(id::text, ','), '')
              FROM (SELECT br.id FROM public.booking_refunds br
                     WHERE br.status = 'completed'
                       AND br.created_at <= (SELECT as_of FROM params)
                       AND abs(COALESCE((
                             SELECT SUM(ft.amount) FROM public.finance_transactions ft
                              WHERE ft.source_refund_id = br.id AND ft.transaction_type = 'refund'
                                AND COALESCE(ft.refund_component, '') NOT IN (
                                  'promotion_discount', 'membership_discount', 'loyalty_redemption', 'loyalty_discount',
                                  'wallet_payment', 'gift_card_payment', 'gift_card_liability_reduction'
                                )
                           ), 0) + br.amount) > 0.005
                       AND abs(COALESCE((
                             SELECT SUM(ft.net) FROM public.finance_transactions ft
                              WHERE ft.source_refund_id = br.id AND ft.transaction_type = 'refund'
                                AND COALESCE(ft.refund_component, '') NOT IN (
                                  'promotion_discount', 'membership_discount', 'loyalty_redemption', 'loyalty_discount',
                                  'wallet_payment', 'gift_card_payment', 'gift_card_liability_reduction'
                                )
                           ), 0) + br.amount) > 0.005
                     LIMIT 10) s)

    UNION ALL
    SELECT 'product_orders.paid_platform_tender_missing_earnings', 'product_orders',
           (SELECT count(*)::int FROM public.product_orders po
             WHERE po.created_at <= (SELECT as_of FROM params)
               AND po.payment_status = 'paid'
               AND po.payment_method IN ('paystack', 'wallet', 'gift_card')
               AND NOT EXISTS (
                 SELECT 1 FROM public.finance_transactions ft
                  WHERE ft.transaction_type = 'provider_earnings'
                    AND (ft.product_order_id = po.id
                         OR (ft.product_order_id IS NULL AND ft.provider_id = po.provider_id
                             AND ft.description ILIKE '%' || po.order_number || '%'))
               )),
           ''

    UNION ALL
    SELECT 'product_orders.unpaid_with_ledger', 'product_orders',
           (SELECT count(*)::int FROM public.product_orders po
             WHERE po.created_at <= (SELECT as_of FROM params)
               AND po.payment_status IS DISTINCT FROM 'paid'
               AND COALESCE(po.refunded_amount, 0) = 0
               AND EXISTS (
                 SELECT 1 FROM public.finance_transactions ft
                  WHERE ft.product_order_id = po.id
               )),
           ''

    UNION ALL
    SELECT 'product_orders.refund_without_reversal', 'product_orders',
           (SELECT count(*)::int FROM public.product_orders po
             WHERE po.created_at <= (SELECT as_of FROM params)
               AND COALESCE(po.refunded_amount, 0) > 0.005
               AND NOT EXISTS (
                 SELECT 1 FROM public.finance_transactions ft
                  WHERE ft.product_order_id = po.id AND ft.transaction_type = 'refund'
               )),
           ''

    UNION ALL
    SELECT 'group_bookings.participant_prices_vs_total', 'group_bookings',
           (SELECT count(*)::int FROM public.group_bookings gb
             WHERE gb.created_at <= (SELECT as_of FROM params)
               AND abs(COALESCE(gb.total_price, 0) - COALESCE((
                     SELECT SUM(bp.price) FROM public.booking_participants bp
                      WHERE bp.group_booking_id = gb.id
                   ), 0)) > 0.005),
           ''

    UNION ALL
    SELECT 'group_bookings.participant_paid_exceeds_due', 'group_bookings',
           (SELECT count(*)::int FROM public.booking_participants bp
             WHERE bp.created_at <= (SELECT as_of FROM params)
               AND COALESCE(bp.amount_paid, 0) > COALESCE(bp.amount_due, bp.price, 0) + 0.005),
           ''

    UNION ALL
    SELECT 'custom_offers.paid_without_matching_booking', 'custom_offers',
           (SELECT count(*)::int FROM public.custom_offers co
             WHERE co.created_at <= (SELECT as_of FROM params)
               AND co.paid_at IS NOT NULL
               AND (
                 co.booking_id IS NULL
                 OR NOT EXISTS (
                   SELECT 1 FROM public.bookings b
                    WHERE b.id = co.booking_id
                      AND abs(COALESCE(b.total_amount, 0) - COALESCE(co.price, 0)) <= 0.005
                 )
                 OR (SELECT count(*) FROM public.bookings b WHERE b.custom_offer_id = co.id) <> 1
               )),
           ''

    UNION ALL
    SELECT 'custom_offers.declined_or_expired_with_payment', 'custom_offers',
           (SELECT count(*)::int FROM public.custom_offers co
             WHERE co.created_at <= (SELECT as_of FROM params)
               AND co.status IN ('declined', 'expired', 'rejected', 'cancelled')
               AND (co.paid_at IS NOT NULL OR co.payment_reference IS NOT NULL)),
           ''

    UNION ALL
    SELECT 'custom_offers.duplicate_payment_reference', 'custom_offers',
           (SELECT count(*)::int FROM (
              SELECT payment_reference FROM public.custom_offers
               WHERE payment_reference IS NOT NULL AND created_at <= (SELECT as_of FROM params)
               GROUP BY payment_reference HAVING count(*) > 1
            ) d),
           ''

    UNION ALL
    SELECT 'payouts.negative_provider_ledger_balance', 'payouts',
           (SELECT count(*)::int FROM (
              SELECT ft.provider_id
                FROM public.finance_transactions ft
               WHERE ft.provider_id IS NOT NULL
                 AND ft.created_at <= (SELECT as_of FROM params)
                 AND (
                   ft.transaction_type IN ('provider_earnings', 'tip', 'travel_fee', 'cancellation_fee', 'payout')
                   OR (ft.transaction_type = 'refund' AND (
                     ft.refund_component IS NULL
                     OR ft.refund_component NOT IN (
                       'platform_fee', 'service_fee', 'tax', 'payment',
                       'promotion_discount', 'membership_discount', 'loyalty_redemption', 'loyalty_discount',
                       'wallet_payment', 'gift_card_payment', 'gift_card_liability_reduction',
                       'membership_sale', 'additional_charge_payment', 'cashback', 'walk_in_additional_charge'
                     )
                   ))
                 )
               GROUP BY ft.provider_id
              HAVING SUM(COALESCE(ft.net, 0)) < -0.005
            ) n),
           ''

    UNION ALL
    SELECT 'wallet.balance_vs_transactions', 'wallet',
           (SELECT count(*)::int FROM public.user_wallets w
             WHERE abs(COALESCE(w.balance, 0) - COALESCE((
                     SELECT SUM(CASE WHEN wt.type = 'credit' THEN wt.amount
                                     WHEN wt.type = 'debit' THEN -wt.amount
                                     ELSE 0 END)
                       FROM public.wallet_transactions wt
                      WHERE wt.wallet_id = w.id
                        AND wt.created_at <= (SELECT as_of FROM params)
                   ), 0)) > 0.005),
           (SELECT COALESCE(string_agg(id::text, ','), '')
              FROM (SELECT w.id FROM public.user_wallets w
                     WHERE abs(COALESCE(w.balance, 0) - COALESCE((
                             SELECT SUM(CASE WHEN wt.type = 'credit' THEN wt.amount
                                             WHEN wt.type = 'debit' THEN -wt.amount
                                             ELSE 0 END)
                               FROM public.wallet_transactions wt
                              WHERE wt.wallet_id = w.id
                                AND wt.created_at <= (SELECT as_of FROM params)
                           ), 0)) > 0.005
                     LIMIT 10) s)

    UNION ALL
    SELECT 'wallet.paid_topups_vs_ledger', 'wallet',
           CASE WHEN abs(
             COALESCE((SELECT SUM(amount) FROM public.wallet_topups
                        WHERE status = 'paid' AND COALESCE(paid_at, created_at) <= (SELECT as_of FROM params)), 0)
             - COALESCE((SELECT SUM(amount) FROM public.finance_transactions
                          WHERE transaction_type = 'wallet_topup'
                            AND created_at <= (SELECT as_of FROM params)), 0)
           ) > 0.005 THEN 1 ELSE 0 END,
           ''

    UNION ALL
    SELECT 'gift_cards.balance_above_initial', 'gift_cards',
           (SELECT count(*)::int FROM public.gift_cards g
             WHERE g.created_at <= (SELECT as_of FROM params)
               AND COALESCE(g.balance, 0) > COALESCE(g.initial_balance, 0) + 0.005),
           ''

    UNION ALL
    SELECT 'memberships.paid_order_missing_sale_leg', 'memberships',
           (SELECT count(*)::int FROM public.membership_orders mo
             WHERE mo.created_at <= (SELECT as_of FROM params)
               AND mo.status = 'paid'
               AND NOT EXISTS (
                 SELECT 1 FROM public.finance_transactions ft
                  WHERE ft.transaction_type = 'membership_sale'
                    AND ft.metadata->>'membership_order_id' = mo.id::text
               )),
           ''

    UNION ALL
    SELECT 'subscriptions.active_with_payment_and_no_ledger', 'subscriptions',
           (SELECT count(*)::int FROM public.provider_subscriptions ps
             WHERE ps.last_payment_date IS NOT NULL
               AND ps.last_payment_date <= (SELECT as_of FROM params)
               AND ps.status IN ('active', 'past_due')
               AND NOT EXISTS (
                 SELECT 1 FROM public.finance_transactions ft
                  WHERE ft.provider_id = ps.provider_id
                    AND ft.transaction_type = 'provider_subscription_payment'
               )),
           (SELECT COALESCE(string_agg(id::text, ','), '')
              FROM (SELECT ps.id FROM public.provider_subscriptions ps
                     WHERE ps.last_payment_date IS NOT NULL
                       AND ps.last_payment_date <= (SELECT as_of FROM params)
                       AND ps.status IN ('active', 'past_due')
                       AND NOT EXISTS (
                         SELECT 1 FROM public.finance_transactions ft
                          WHERE ft.provider_id = ps.provider_id
                            AND ft.transaction_type = 'provider_subscription_payment'
                       )
                     LIMIT 10) s)

    UNION ALL
    SELECT 'terminal.paid_invoice_missing_ledger', 'terminal',
           (SELECT count(*)::int FROM public.terminal_orders t
             WHERE t.invoice_status::text = 'paid'
               AND t.updated_at <= (SELECT as_of FROM params)
               AND NOT EXISTS (
                 SELECT 1 FROM public.finance_transactions ft
                  WHERE ft.metadata->>'terminal_order_id' = t.id::text
               )),
           ''

    UNION ALL
    SELECT 'tips.allocations_do_not_sum_to_tip', 'tips',
           (SELECT count(*)::int FROM public.bookings b
             WHERE b.created_at <= (SELECT as_of FROM params)
               AND COALESCE(b.tip_amount, 0) > 0
               AND EXISTS (SELECT 1 FROM public.booking_tip_allocations a WHERE a.booking_id = b.id)
               AND abs(COALESCE(b.tip_amount, 0) - COALESCE((
                     SELECT SUM(a.amount) FROM public.booking_tip_allocations a WHERE a.booking_id = b.id
                   ), 0)) > 0.005),
           ''
  ) raw
)
SELECT jsonb_build_object(
  'as_of', (SELECT as_of FROM params),
  'project_ref', 'byfzhyqvtbasxptxdupf',
  'required_migrations', (
    SELECT COALESCE(jsonb_object_agg(version, name), '{}'::jsonb)
      FROM supabase_migrations.schema_migrations
     WHERE version IN ('10105', '10116', '10124', '10125', '10139', '10141', '10145', '10180', '10181')
  ),
  'enums', jsonb_build_object(
    'booking_status', (SELECT COALESCE(jsonb_agg(e.enumlabel ORDER BY e.enumsortorder), '[]'::jsonb)
                         FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'booking_status'),
    'payment_status', (SELECT COALESCE(jsonb_agg(e.enumlabel ORDER BY e.enumsortorder), '[]'::jsonb)
                         FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'payment_status')
  ),
  'inventory', jsonb_build_object(
    'tenants', (SELECT count(*) FROM public.tenants),
    'tenant_ids', (SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) FROM public.tenants),
    'bookings', (SELECT count(*) FROM public.bookings WHERE created_at <= (SELECT as_of FROM params)),
    'finance_transactions', (SELECT count(*) FROM public.finance_transactions WHERE created_at <= (SELECT as_of FROM params)),
    'product_orders', (SELECT count(*) FROM public.product_orders WHERE created_at <= (SELECT as_of FROM params)),
    'group_bookings', (SELECT count(*) FROM public.group_bookings WHERE created_at <= (SELECT as_of FROM params)),
    'booking_participants', (SELECT count(*) FROM public.booking_participants WHERE created_at <= (SELECT as_of FROM params)),
    'custom_offers', (SELECT count(*) FROM public.custom_offers WHERE created_at <= (SELECT as_of FROM params)),
    'custom_requests', (SELECT count(*) FROM public.custom_requests WHERE created_at <= (SELECT as_of FROM params)),
    'booking_payments', (SELECT count(*) FROM public.booking_payments WHERE created_at <= (SELECT as_of FROM params)),
    'booking_refunds', (SELECT count(*) FROM public.booking_refunds WHERE created_at <= (SELECT as_of FROM params)),
    'payment_transactions', (SELECT count(*) FROM public.payment_transactions WHERE created_at <= (SELECT as_of FROM params)),
    'payouts', (SELECT count(*) FROM public.payouts WHERE created_at <= (SELECT as_of FROM params)),
    'wallet_transactions', (SELECT count(*) FROM public.wallet_transactions WHERE created_at <= (SELECT as_of FROM params)),
    'wallet_topups', (SELECT count(*) FROM public.wallet_topups WHERE created_at <= (SELECT as_of FROM params)),
    'user_wallets', (SELECT count(*) FROM public.user_wallets),
    'gift_cards', (SELECT count(*) FROM public.gift_cards WHERE created_at <= (SELECT as_of FROM params)),
    'membership_orders', (SELECT count(*) FROM public.membership_orders WHERE created_at <= (SELECT as_of FROM params)),
    'provider_subscriptions', (SELECT count(*) FROM public.provider_subscriptions),
    'terminal_orders', (SELECT count(*) FROM public.terminal_orders),
    'customers_with_bookings', (SELECT count(DISTINCT customer_id) FROM public.bookings WHERE created_at <= (SELECT as_of FROM params)),
    'providers_with_ledger', (SELECT count(DISTINCT provider_id) FROM public.finance_transactions WHERE provider_id IS NOT NULL AND created_at <= (SELECT as_of FROM params))
  ),
  'observed', jsonb_build_object(
    'booking_states', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'status', status, 'payment_status', payment_status, 'booking_source', booking_source, 'n', n,
        'total', total, 'paid', paid, 'refunded', refunded
      )), '[]'::jsonb)
      FROM (
        SELECT status::text AS status, payment_status::text AS payment_status, booking_source,
               count(*) AS n,
               round(sum(total_amount)::numeric, 2) AS total,
               round(sum(COALESCE(total_paid, 0))::numeric, 2) AS paid,
               round(sum(COALESCE(total_refunded, 0))::numeric, 2) AS refunded
          FROM public.bookings
         WHERE created_at <= (SELECT as_of FROM params)
         GROUP BY 1, 2, 3
      ) s
    ),
    'payment_transaction_statuses', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('status', status, 'n', n)), '[]'::jsonb)
        FROM (SELECT status, count(*) AS n FROM public.payment_transactions
               WHERE created_at <= (SELECT as_of FROM params) GROUP BY status) s
    ),
    'booking_payment_statuses', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('status', status, 'payment_provider', payment_provider, 'n', n)), '[]'::jsonb)
        FROM (SELECT status, payment_provider, count(*) AS n FROM public.booking_payments
               WHERE created_at <= (SELECT as_of FROM params) GROUP BY 1, 2) s
    ),
    'subscription_statuses', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('status', status, 'n', n)), '[]'::jsonb)
        FROM (SELECT status, count(*) AS n FROM public.provider_subscriptions GROUP BY status) s
    ),
    'currencies', (
      SELECT COALESCE(jsonb_agg(DISTINCT currency), '[]'::jsonb)
        FROM public.finance_transactions
       WHERE created_at <= (SELECT as_of FROM params) AND currency IS NOT NULL
    ),
    'timezone', (
      SELECT settings->>'timezone' FROM public.platform_settings
       WHERE is_active IS TRUE ORDER BY updated_at DESC LIMIT 1
    ),
    'ledger_min', (SELECT min(created_at) FROM public.finance_transactions WHERE created_at <= (SELECT as_of FROM params)),
    'ledger_max', (SELECT max(created_at) FROM public.finance_transactions WHERE created_at <= (SELECT as_of FROM params)),
    'sast_boundary_ledger_rows', (
      SELECT count(*) FROM public.finance_transactions
       WHERE created_at <= (SELECT as_of FROM params)
         AND EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC') >= 22
    ),
    'sast_boundary_bookings', (
      SELECT count(*) FROM public.bookings
       WHERE created_at <= (SELECT as_of FROM params)
         AND EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC') >= 22
    ),
    'wallet_topup_cash_collected', (
      SELECT COALESCE(round(sum(amount)::numeric, 2), 0)
        FROM public.wallet_topups
       WHERE status = 'paid'
         AND COALESCE(paid_at, created_at) <= (SELECT as_of FROM params)
    ),
    'completed_booking_refunds', (
      SELECT COALESCE(round(sum(amount)::numeric, 2), 0)
        FROM public.booking_refunds
       WHERE status = 'completed'
         AND created_at <= (SELECT as_of FROM params)
    )
  ),
  'shadow_gl', (
    SELECT to_jsonb(s) FROM public.ledger_reconciliation_summary('-infinity'::timestamptz, (SELECT as_of + interval '1 second' FROM params)) s
  ),
  'checks', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'check_id', check_id, 'domain', domain, 'violations', violations, 'samples', samples
    ) ORDER BY check_id), '[]'::jsonb) FROM checks),
  'ledger', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', ft.id,
      'transaction_type', ft.transaction_type,
      'refund_component', ft.refund_component,
      'amount', ft.amount,
      'fees', ft.fees,
      'commission', ft.commission,
      'net', ft.net,
      'currency', ft.currency,
      'booking_id', ft.booking_id,
      'product_order_id', ft.product_order_id,
      'provider_id', ft.provider_id,
      'tenant_id', ft.tenant_id,
      'source_payment_id', ft.source_payment_id,
      'source_refund_id', ft.source_refund_id,
      'payout_id', ft.payout_id,
      'created_at', ft.created_at,
      'vat_source', ft.metadata->>'vat_source',
      'reversed_at', ft.metadata->>'reversed_at'
    ) ORDER BY ft.created_at), '[]'::jsonb)
    FROM public.finance_transactions ft
    WHERE ft.created_at <= (SELECT as_of FROM params)
  ),
  'bookings', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', b.id,
      'status', b.status,
      'payment_status', b.payment_status,
      'booking_source', b.booking_source,
      'currency', b.currency,
      'total_amount', b.total_amount,
      'total_paid', b.total_paid,
      'total_refunded', b.total_refunded,
      'cancellation_fee', b.cancellation_fee,
      'tax_amount', b.tax_amount,
      'tip_amount', b.tip_amount,
      'travel_fee', b.travel_fee,
      'platform_fee_amount', b.platform_fee_amount,
      'service_fee_amount', b.service_fee_amount,
      'wallet_amount', b.wallet_amount,
      'gift_card_amount', b.gift_card_amount,
      'provider_id', b.provider_id,
      'tenant_id', b.tenant_id,
      'group_booking_id', b.group_booking_id,
      'custom_offer_id', b.custom_offer_id,
      'rescheduled_from_booking_id', b.rescheduled_from_booking_id,
      'reschedule_carry_over_finalized_at', b.reschedule_carry_over_finalized_at,
      'cancellation_settled_at', b.cancellation_settled_at,
      'created_at', b.created_at
    ) ORDER BY b.created_at), '[]'::jsonb)
    FROM public.bookings b
    WHERE b.created_at <= (SELECT as_of FROM params)
  ),
  'provider_summaries', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'provider_id', x.provider_id,
      'rpc', public.provider_finance_summary(x.provider_id, '-infinity'::timestamptz, (SELECT as_of FROM params)),
      'sql_service_earnings', x.service_earnings,
      'sql_refund_deduction', x.refund_deduction,
      'sql_tips', x.tips,
      'sql_travel', x.travel_fees,
      'sql_cancellation', x.cancellation_fees
    ))
    FROM (
      SELECT ft.provider_id,
             COALESCE(SUM(ft.net) FILTER (WHERE ft.transaction_type = 'provider_earnings'), 0) AS service_earnings,
             COALESCE(SUM(ft.net) FILTER (WHERE ft.transaction_type = 'tip'), 0) AS tips,
             COALESCE(SUM(ft.net) FILTER (WHERE ft.transaction_type = 'travel_fee'), 0) AS travel_fees,
             COALESCE(SUM(ft.net) FILTER (WHERE ft.transaction_type = 'cancellation_fee'), 0) AS cancellation_fees,
             COALESCE(SUM(ABS(ft.net)) FILTER (
               WHERE ft.transaction_type = 'refund'
                 AND (ft.refund_component IS NULL OR ft.refund_component NOT IN (
                   'platform_fee', 'service_fee', 'tax', 'payment',
                   'promotion_discount', 'membership_discount', 'loyalty_redemption', 'loyalty_discount',
                   'wallet_payment', 'gift_card_payment', 'gift_card_liability_reduction', 'membership_sale',
                   'additional_charge_payment', 'cashback'
                 ))
             ), 0) AS refund_deduction
        FROM public.finance_transactions ft
       WHERE ft.provider_id IS NOT NULL
         AND ft.created_at <= (SELECT as_of FROM params)
       GROUP BY ft.provider_id
    ) x
  ), '[]'::jsonb)
) AS report;
