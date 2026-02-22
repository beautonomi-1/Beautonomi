-- Add calendar_preferences JSONB to provider_settings for calendar display options
ALTER TABLE public.provider_settings
ADD COLUMN IF NOT EXISTS calendar_preferences JSONB DEFAULT NULL;

COMMENT ON COLUMN public.provider_settings.calendar_preferences IS 'Calendar display preferences (workday hours, time increment, show canceled, etc.)';
