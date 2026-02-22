-- Fix RLS policy for preference_options to check users table role instead of auth.role()
-- auth.role() refers to JWT role claim, not the role in users table
-- This migration fixes the policy if it was created with the wrong auth.role() check

-- Only proceed if the table exists
DO $$
BEGIN
  -- Check if table exists
  IF EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'preference_options'
  ) THEN
    -- Drop existing policy if it exists (may have been created with auth.role())
    DROP POLICY IF EXISTS "Superadmins can manage preference options" ON public.preference_options;

    -- Create new policy that checks users table role
    CREATE POLICY "Superadmins can manage preference options"
      ON public.preference_options FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.users
          WHERE users.id = auth.uid()
          AND users.role = 'superadmin'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.users
          WHERE users.id = auth.uid()
          AND users.role = 'superadmin'
        )
      );
  END IF;
END $$;
