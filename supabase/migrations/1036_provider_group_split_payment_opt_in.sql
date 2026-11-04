-- Split group payment is provider opt-in: when off, the organizer pays for the whole group.

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS group_split_payment_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.providers.group_split_payment_enabled IS
  'When true, online group bookings may use group_payment_mode = split (each guest pays their share).';
