-- Mirror bookings.payment_status onto appointment-linked product_orders.payment_status.
-- Appointment product orders are fulfillment mirrors only; revenue stays on bookings.
-- Idempotent: safe to re-run.

CREATE OR REPLACE FUNCTION public.mirror_booking_payment_to_appointment_product_orders()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_payment_status TEXT;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF NEW.payment_status IS NOT DISTINCT FROM OLD.payment_status THEN
    RETURN NEW;
  END IF;

  IF NEW.payment_status = 'paid' THEN
    v_order_payment_status := 'paid';
  ELSIF NEW.payment_status = 'refunded' THEN
    v_order_payment_status := 'refunded';
  ELSE
    v_order_payment_status := 'pending';
  END IF;

  UPDATE public.product_orders po
  SET
    payment_status = v_order_payment_status,
    paid_at = CASE
      WHEN v_order_payment_status = 'paid' THEN COALESCE(po.paid_at, NOW())
      ELSE po.paid_at
    END,
    updated_at = NOW()
  WHERE po.booking_id = NEW.id
    AND po.order_source = 'appointment';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mirror_booking_payment_to_appointment_product_orders ON public.bookings;

CREATE TRIGGER trg_mirror_booking_payment_to_appointment_product_orders
  AFTER UPDATE OF payment_status ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.mirror_booking_payment_to_appointment_product_orders();

COMMENT ON FUNCTION public.mirror_booking_payment_to_appointment_product_orders() IS
  'Keeps appointment product_orders.payment_status in sync with the parent booking. No payment_transactions or finance rows.';

-- One-time backfill for existing rows.
UPDATE public.product_orders po
SET
  payment_status = CASE
    WHEN b.payment_status = 'paid' THEN 'paid'
    WHEN b.payment_status = 'refunded' THEN 'refunded'
    ELSE 'pending'
  END,
  paid_at = CASE
    WHEN b.payment_status = 'paid' THEN COALESCE(po.paid_at, NOW())
    ELSE po.paid_at
  END,
  updated_at = NOW()
FROM public.bookings b
WHERE po.booking_id = b.id
  AND po.order_source = 'appointment'
  AND po.payment_status IS DISTINCT FROM CASE
    WHEN b.payment_status = 'paid' THEN 'paid'
    WHEN b.payment_status = 'refunded' THEN 'refunded'
    ELSE 'pending'
  END;
