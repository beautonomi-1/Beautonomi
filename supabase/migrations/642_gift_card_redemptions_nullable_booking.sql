-- Allow gift_card_redemptions.booking_id to be NULL.
--
-- §Wallet-audit 2026-05: redeeming a gift card to the wallet
-- (POST /api/me/wallet/redeem-gift-card) credits the wallet and then tries to
-- write a redemption audit row WITHOUT a booking_id. The original NOT NULL
-- booking_id (migration 023) made that insert fail silently after the credit,
-- so there was no audit trail for wallet redemptions. Wallet redemptions are not
-- tied to a booking, so booking_id must be optional here.

ALTER TABLE public.gift_card_redemptions
  ALTER COLUMN booking_id DROP NOT NULL;

-- The original unique index enforced one redemption per booking. Keep that
-- guarantee for booking-linked redemptions, but allow many booking-less wallet
-- redemptions (each NULL booking_id) to coexist.
DROP INDEX IF EXISTS ux_gift_card_redemptions_booking;
CREATE UNIQUE INDEX IF NOT EXISTS ux_gift_card_redemptions_booking
  ON public.gift_card_redemptions(booking_id)
  WHERE booking_id IS NOT NULL;
