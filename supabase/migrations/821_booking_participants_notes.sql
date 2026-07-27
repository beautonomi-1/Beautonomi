-- Beautonomi Database Migration
-- 821_booking_participants_notes.sql
--
-- The provider app collects per-participant notes (preferences, allergies,
-- add-on instructions) when adding someone to a group booking, and the group
-- sheet renders `participant.notes`, but the column never existed: the value
-- was stripped by the API schema and only survived inside the child booking's
-- special_requests. Give participant notes a home of their own — inline
-- participants have no child booking at all, so today their notes are lost.

ALTER TABLE public.booking_participants
  ADD COLUMN IF NOT EXISTS notes TEXT;

COMMENT ON COLUMN public.booking_participants.notes IS
  'Per-participant service notes (preferences, allergies, add-on instructions) captured when the participant is added to the group.';
