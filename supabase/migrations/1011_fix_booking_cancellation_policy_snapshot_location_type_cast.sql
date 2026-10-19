-- Fix text vs location_type enum comparison in booking cancellation policy snapshot trigger.

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
