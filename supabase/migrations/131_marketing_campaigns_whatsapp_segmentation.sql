-- Migration: Add WhatsApp support and enhance segmentation for marketing campaigns
-- 131_marketing_campaigns_whatsapp_segmentation.sql

-- Add WhatsApp to campaign type enum
ALTER TABLE marketing_campaigns 
  DROP CONSTRAINT IF EXISTS marketing_campaigns_type_check;

ALTER TABLE marketing_campaigns
  ADD CONSTRAINT marketing_campaigns_type_check 
  CHECK (type IN ('email', 'sms', 'whatsapp'));

-- Add segmentation criteria JSONB column for storing segment filters
ALTER TABLE marketing_campaigns
  ADD COLUMN IF NOT EXISTS segment_criteria JSONB;

-- Add comment for segment_criteria
COMMENT ON COLUMN marketing_campaigns.segment_criteria IS 'JSON object storing segmentation criteria: {min_bookings, max_bookings, min_spent, max_spent, last_booking_days, tags, is_favorite, etc.}';

-- Create index for segment_criteria queries
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_segment_criteria 
  ON marketing_campaigns USING GIN (segment_criteria);
