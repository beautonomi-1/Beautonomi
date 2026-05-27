-- Provider toggle: accept Paystack Virtual Terminal as a POS payment method.
ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS accept_paystack_terminal BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.providers.accept_paystack_terminal IS
  'When true and payment_paystack_virtual_terminal flag is on, provider accepts Paystack Terminal at POS.';
