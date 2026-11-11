-- The provider app listens for a new Paystack terminal payment on the staff
-- session. REPLICA IDENTITY FULL published every column, including the
-- payer's email and phone and the raw charge, which also carries that
-- address. The alert reads the payment id, reference, amounts, payer name,
-- and the suggested match. It does not read the address.
--
-- Replica identity returns to the primary key. The publication then lists
-- every other column and omits the payer email, the payer phone, and the raw
-- charge. A later column is not published until this list is extended.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'provider_paystack_terminal_payments'
    ) THEN
      ALTER PUBLICATION supabase_realtime DROP TABLE public.provider_paystack_terminal_payments;
    END IF;

    ALTER TABLE public.provider_paystack_terminal_payments REPLICA IDENTITY DEFAULT;

    ALTER PUBLICATION supabase_realtime ADD TABLE public.provider_paystack_terminal_payments (
      id,
      provider_id,
      terminal_id,
      terminal_code,
      paystack_transaction_id,
      paystack_reference,
      status,
      allocation_status,
      amount_match_status,
      gross_amount,
      paid_amount,
      expected_amount,
      amount_due_at_match_time,
      amount_difference,
      gateway_fee_amount,
      net_amount,
      allocated_amount,
      overpayment_amount,
      remaining_balance,
      currency,
      payer_name,
      customer_reference,
      suggested_entity_type,
      suggested_entity_id,
      suggestion_confidence,
      candidate_match_reasons,
      provider_notification_status,
      provider_notified_at,
      provider_seen_at,
      provider_assigned_entity_type,
      provider_assigned_entity_id,
      provider_assignment_reason,
      provider_assigned_by,
      provider_assigned_at,
      provider_declined_suggestion,
      provider_decline_reason,
      payout_eligibility_status,
      payout_hold_until,
      payout_id,
      support_case_id,
      dispute_id,
      refund_status,
      metadata,
      received_at,
      allocated_at,
      created_at,
      updated_at,
      match_candidates
    );
  END IF;
END $$;
