-- Add customization column to booking_services for service-level notes/customization
-- Provider mobile app sends a "customization" field per service item

ALTER TABLE booking_services
  ADD COLUMN IF NOT EXISTS customization text;

COMMENT ON COLUMN booking_services.customization
  IS 'Free-text service customization notes set by the provider or customer at booking time';
