-- Booking cancellation policy snapshot + provider reschedule tracking + policy backfill

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS cancellation_policy_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS provider_rescheduled_at TIMESTAMPTZ;

COMMENT ON COLUMN public.bookings.cancellation_policy_snapshot IS 'Policy locked at booking creation (window, grace, refund %, no-show snapshot).';
COMMENT ON COLUMN public.bookings.provider_rescheduled_at IS 'Set when provider moves appointment; waives late-cancel fee for customer.';

CREATE OR REPLACE FUNCTION public.set_booking_cancellation_policy_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_policy RECORD;
  v_provider RECORD;
BEGIN
  IF NEW.cancellation_policy_snapshot IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT cp.* INTO v_policy
  FROM public.cancellation_policies cp
  WHERE cp.provider_id = NEW.provider_id
    AND cp.is_active = true
    AND (
      cp.location_type = NEW.location_type::text
      OR cp.location_type IS NULL
    )
  ORDER BY
    CASE WHEN cp.location_type = NEW.location_type::text THEN 0 ELSE 1 END,
    cp.is_default DESC,
    cp.created_at DESC
  LIMIT 1;

  SELECT
    p.requires_deposit,
    p.deposit_percentage,
    p.no_show_fee_enabled,
    p.no_show_fee_amount
  INTO v_provider
  FROM public.providers p
  WHERE p.id = NEW.provider_id;

  NEW.cancellation_policy_snapshot := jsonb_build_object(
    'policy_id', v_policy.id,
    'hours_before_cutoff', COALESCE(v_policy.hours_before, v_policy.hours_before_cutoff, 24),
    'grace_window_minutes', COALESCE(v_policy.grace_window_minutes, 15),
    'refund_percentage', COALESCE(v_policy.refund_percentage, 50),
    'fee_amount', COALESCE(v_policy.fee_amount, 0),
    'fee_type', COALESCE(v_policy.fee_type, 'fixed'),
    'policy_text', v_policy.policy_text,
    'requires_deposit', COALESCE(v_provider.requires_deposit, false),
    'deposit_percentage', COALESCE(v_provider.deposit_percentage, 0),
    'no_show_fee_enabled', COALESCE(v_provider.no_show_fee_enabled, false),
    'no_show_fee_amount', COALESCE(v_provider.no_show_fee_amount, 0)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_booking_cancellation_policy_snapshot ON public.bookings;
CREATE TRIGGER trg_set_booking_cancellation_policy_snapshot
  BEFORE INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_booking_cancellation_policy_snapshot();

-- Backfill default policy rows for providers without any active policy
INSERT INTO public.cancellation_policies (
  provider_id,
  name,
  location_type,
  hours_before,
  hours_before_cutoff,
  grace_window_minutes,
  refund_percentage,
  fee_amount,
  fee_type,
  policy_text,
  late_cancellation_type,
  is_default,
  is_active
)
SELECT
  p.id,
  'Standard',
  NULL,
  COALESCE(NULLIF(p.cancellation_window_hours, 0), 24),
  COALESCE(NULLIF(p.cancellation_window_hours, 0), 24),
  15,
  50,
  0,
  'fixed',
  'Cancellations must be made at least 24 hours before your appointment. 50% refund if cancelled later.',
  'partial_refund',
  true,
  true
FROM public.providers p
WHERE NOT EXISTS (
  SELECT 1 FROM public.cancellation_policies cp
  WHERE cp.provider_id = p.id AND cp.is_active = true
);
