-- Add resource_type (room, chair, equipment, other) and calendar_color for provider resources
-- Aligns API and mobile app with web; used for filtering and calendar display
ALTER TABLE public.resources
  ADD COLUMN IF NOT EXISTS resource_type TEXT DEFAULT 'room' CHECK (resource_type IN ('room', 'chair', 'equipment', 'other')),
  ADD COLUMN IF NOT EXISTS calendar_color TEXT DEFAULT '#6366f1';

COMMENT ON COLUMN public.resources.resource_type IS 'Display type: room, chair, equipment, other';
COMMENT ON COLUMN public.resources.calendar_color IS 'Hex color for calendar display';
