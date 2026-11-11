-- Any active staff member of a salon can read a Paystack terminal setup
-- request, including the WhatsApp number and the destination list that holds
-- it. Drop the table read for anon and authenticated, then grant every other
-- column. The destination name stays. INSERT and UPDATE stay, so a request
-- can still store that number. The terminal screen keeps the original table
-- read after the payments permission check.

REVOKE SELECT ON TABLE public.provider_paystack_virtual_terminal_setup_requests FROM PUBLIC, anon, authenticated;

GRANT SELECT (
  id,
  provider_id,
  location_id,
  requested_by,
  status,
  requested_display_name,
  suggested_paystack_name,
  currency,
  destination_name,
  custom_fields,
  metadata,
  request_notes,
  fulfilled_terminal_id,
  fulfilled_by,
  fulfilled_at,
  cancelled_at,
  created_at,
  updated_at,
  rejection_reason,
  rejected_by,
  rejected_at,
  support_ticket_id
) ON TABLE public.provider_paystack_virtual_terminal_setup_requests TO anon, authenticated;
