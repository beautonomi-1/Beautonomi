-- Beautonomi Database Migration
-- 112_add_support_agent_role.sql
-- Adds support_agent role to user_role enum
-- 
-- NOTE: This migration ONLY adds the enum value.
-- Migration 113 will update the RLS policies to use it.
-- This is required because enum values must be committed before they can be used.

-- Add support_agent to user_role enum
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_enum 
    WHERE enumlabel = 'support_agent' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
  ) THEN
    ALTER TYPE user_role ADD VALUE 'support_agent';
  END IF;
END $$;
