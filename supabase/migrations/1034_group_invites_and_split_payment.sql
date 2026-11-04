-- Group booking invites + split-payment participant fields.

-- Booking drafts are JSON on the booking API, not a table. Split mode is stored on group_bookings.

ALTER TABLE public.group_bookings
  ADD COLUMN IF NOT EXISTS group_payment_mode TEXT NOT NULL DEFAULT 'organizer_pays_all'
    CHECK (group_payment_mode IN ('organizer_pays_all', 'split'));

ALTER TABLE public.booking_participants
  ADD COLUMN IF NOT EXISTS amount_due NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS participant_payment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (participant_payment_status IN ('pending', 'paid', 'waived', 'cancelled'));

CREATE TABLE IF NOT EXISTS public.group_booking_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_booking_id UUID NOT NULL REFERENCES public.group_bookings(id) ON DELETE CASCADE,
  booking_participant_id UUID REFERENCES public.booking_participants(id) ON DELETE SET NULL,
  -- sha256 hex of the raw link token; the raw token is only ever sent to the guest.
  invite_token_hash TEXT NOT NULL,
  invited_name TEXT,
  invited_email TEXT,
  invited_phone TEXT,
  amount_due NUMERIC(12, 2),
  currency TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'revoked', 'cancelled')),
  expires_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  last_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT group_booking_invites_token_hash_unique UNIQUE (invite_token_hash)
);

CREATE INDEX IF NOT EXISTS idx_group_booking_invites_group
  ON public.group_booking_invites (group_booking_id);

CREATE INDEX IF NOT EXISTS idx_group_booking_invites_participant
  ON public.group_booking_invites (booking_participant_id)
  WHERE booking_participant_id IS NOT NULL;

ALTER TABLE public.group_booking_invites ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.group_booking_invites IS
  'Shareable invite links for group booking guests (split payment + roster).';
