-- Pay-link tips: apply a tip to bookings.tip_amount / total_amount exactly once per
-- booking_payments row. The marker row and the booking increment commit in the same
-- transaction, so a webhook that crashed after recording the payment can safely retry,
-- and concurrent webhook + verify-reference runs cannot double-apply.

CREATE TABLE IF NOT EXISTS public.booking_tip_applications (
  booking_payment_id UUID PRIMARY KEY REFERENCES public.booking_payments(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  tip_amount NUMERIC(10, 2) NOT NULL CHECK (tip_amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_tip_applications_booking
  ON public.booking_tip_applications (booking_id);

ALTER TABLE public.booking_tip_applications ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.booking_tip_applications FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.booking_tip_applications TO service_role;

CREATE OR REPLACE FUNCTION public.apply_booking_payment_tip(
  p_booking_payment_id UUID,
  p_tip_amount NUMERIC
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tip NUMERIC := round(GREATEST(COALESCE(p_tip_amount, 0), 0), 2);
  v_booking_id UUID;
  v_inserted INT;
BEGIN
  IF v_tip <= 0 THEN
    RETURN FALSE;
  END IF;

  SELECT bp.booking_id INTO v_booking_id
  FROM public.booking_payments bp
  WHERE bp.id = p_booking_payment_id;

  IF v_booking_id IS NULL THEN
    RAISE EXCEPTION 'booking payment % not found', p_booking_payment_id
      USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.booking_tip_applications (booking_payment_id, booking_id, tip_amount)
  VALUES (p_booking_payment_id, v_booking_id, v_tip)
  ON CONFLICT (booking_payment_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    RETURN FALSE;
  END IF;

  UPDATE public.bookings
  SET tip_amount = COALESCE(tip_amount, 0) + v_tip,
      total_amount = COALESCE(total_amount, 0) + v_tip,
      updated_at = now()
  WHERE id = v_booking_id;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_booking_payment_tip(UUID, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_booking_payment_tip(UUID, NUMERIC) TO service_role;

-- Pay-link payments recorded before this migration already had their tip added to the
-- booking by the application; mark them applied so a late retry does not add it again.
INSERT INTO public.booking_tip_applications (booking_payment_id, booking_id, tip_amount)
SELECT DISTINCT ON (bp.id) bp.id, bp.booking_id, round((p.metadata->>'tip_amount')::numeric, 2)
FROM public.booking_payments bp
JOIN public.payments p
  ON p.payment_provider_transaction_id = bp.payment_provider_id
 AND p.booking_id = bp.booking_id
WHERE p.metadata->>'type' = 'booking_remaining'
  AND COALESCE(p.metadata->>'tip_amount', '') ~ '^[0-9]+(\.[0-9]+)?$'
  AND round((p.metadata->>'tip_amount')::numeric, 2) > 0
ORDER BY bp.id, p.created_at DESC
ON CONFLICT (booking_payment_id) DO NOTHING;
