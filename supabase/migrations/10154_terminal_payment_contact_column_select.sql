-- A table-level SELECT grant lets any signed-in staff session read
-- provider_paystack_terminal_payments.payer_email and payer_phone, and the
-- raw charge that stores the same address. The live alert already omits
-- those fields. Drop the table read for anon and authenticated, then grant
-- every other column, including the payer name. The service role keeps the
-- table grant so the webhook can still store the address. INSERT and UPDATE
-- stay.

REVOKE SELECT ON TABLE public.provider_paystack_terminal_payments FROM PUBLIC, anon, authenticated;

GRANT SELECT (
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
) ON TABLE public.provider_paystack_terminal_payments TO anon, authenticated;
