-- Beautonomi Database Migration
-- 158_add_type_to_note_templates.sql
-- Adds type column to note_templates table for visibility control

-- Add type column to note_templates
ALTER TABLE public.note_templates
ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'internal' CHECK (type IN ('internal', 'client_visible', 'system'));

-- Update existing records to have a default type
UPDATE public.note_templates
SET type = 'internal'
WHERE type IS NULL;

-- Add comment
COMMENT ON COLUMN public.note_templates.type IS 'Visibility type: internal (staff only), client_visible (shown to clients), system (system-generated)';

-- Create index for filtering by type
CREATE INDEX IF NOT EXISTS idx_note_templates_type ON note_templates(provider_id, type) WHERE is_active = true;
