-- Migration 772: PayCloud initiation channel (cloud vs same_terminal Intent)

ALTER TABLE public.provider_paycloud_payments
  ADD COLUMN IF NOT EXISTS initiation_channel TEXT NOT NULL DEFAULT 'cloud'
  CHECK (initiation_channel IN ('cloud', 'same_terminal'));

COMMENT ON COLUMN public.provider_paycloud_payments.initiation_channel IS
  'How the charge was started: cloud (ecrorder) or same_terminal (Intent on device).';

INSERT INTO public.feature_flags (feature_key, feature_name, description, enabled, category)
SELECT
  'payment_paycloud_same_terminal',
  'PayCloud same-device payments',
  'Allow Beautonomi provider app on P5/P5L to start card payments via same-terminal Intent (requires hardware validation).',
  false,
  'payments'
WHERE NOT EXISTS (
  SELECT 1 FROM public.feature_flags
  WHERE feature_key = 'payment_paycloud_same_terminal' AND tenant_id IS NULL
);
