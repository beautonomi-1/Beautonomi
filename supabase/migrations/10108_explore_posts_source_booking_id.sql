-- Link explore posts to the booking that prompted "post your work" (provider completion flow).
ALTER TABLE public.explore_posts
  ADD COLUMN IF NOT EXISTS source_booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_explore_posts_provider_source_booking
  ON public.explore_posts (provider_id, source_booking_id)
  WHERE source_booking_id IS NOT NULL;
