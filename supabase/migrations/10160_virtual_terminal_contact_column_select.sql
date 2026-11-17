-- Any active staff member of a salon can read a Paystack virtual terminal,
-- including the WhatsApp number, the destination list that holds it, and the
-- business snapshot that stores the owner email and phone. Drop the table
-- read for anon and authenticated, then grant every other column. INSERT and
-- UPDATE stay, so a terminal can still store that number. The terminal
-- screens keep the original table read after the payments permission check.

REVOKE SELECT ON TABLE public.provider_paystack_virtual_terminals FROM PUBLIC, anon, authenticated;

GRANT SELECT (
  id,
  provider_id,
  location_id,
  paystack_terminal_id,
  terminal_code,
  name,
  status,
  currency,
  active,
  custom_fields,
  metadata,
  split_code,
  qr_url,
  terminal_url,
  last_synced_at,
  last_payment_at,
  created_at,
  updated_at,
  deleted_at,
  display_name,
  paystack_domain,
  payment_link,
  poster_url,
  poster_storage_path,
  poster_uploaded_by,
  poster_uploaded_at,
  asset_status,
  asset_notes,
  asset_completed_at,
  asset_completed_by,
  asset_last_requested_at,
  asset_last_requested_by,
  notification_whatsapp_label,
  destination_status,
  identity_status,
  paystack_dashboard_url,
  synced_from_paystack_at,
  sync_match_confidence,
  sync_match_reasons,
  asset_request_status,
  asset_request_notes,
  asset_requested_by_provider_at,
  asset_request_completed_at
) ON TABLE public.provider_paystack_virtual_terminals TO anon, authenticated;
