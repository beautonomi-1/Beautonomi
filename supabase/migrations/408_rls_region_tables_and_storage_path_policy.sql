-- Migration 408: RLS for region infrastructure tables + scoped storage policies
-- Addresses audit finding: regions, region_settings, region_payment_gateways, region_secrets
-- had no RLS, leaving gateway config and secrets exposed to any authenticated user.
-- Also tightens product-images storage policies to be path-scoped per provider.

-- ============================================================================
-- 1. regions — public read-only; writes via service_role only
-- ============================================================================
ALTER TABLE IF EXISTS public.regions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'regions' AND policyname = 'Anyone can read active regions'
  ) THEN
    CREATE POLICY "Anyone can read active regions"
      ON public.regions FOR SELECT
      USING (is_active = true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'regions' AND policyname = 'Service role full access regions'
  ) THEN
    CREATE POLICY "Service role full access regions"
      ON public.regions FOR ALL
      USING (auth.jwt() ->> 'role' = 'service_role');
  END IF;
END $$;

-- ============================================================================
-- 2. region_settings — public read-only for active settings; writes via service_role
-- ============================================================================
ALTER TABLE IF EXISTS public.region_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'region_settings' AND policyname = 'Anyone can read active region settings'
  ) THEN
    CREATE POLICY "Anyone can read active region settings"
      ON public.region_settings FOR SELECT
      USING (is_active = true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'region_settings' AND policyname = 'Service role full access region_settings'
  ) THEN
    CREATE POLICY "Service role full access region_settings"
      ON public.region_settings FOR ALL
      USING (auth.jwt() ->> 'role' = 'service_role');
  END IF;
END $$;

-- ============================================================================
-- 3. region_payment_gateways — service_role only (contains payment gateway config)
-- ============================================================================
ALTER TABLE IF EXISTS public.region_payment_gateways ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'region_payment_gateways' AND policyname = 'Service role full access region_payment_gateways'
  ) THEN
    CREATE POLICY "Service role full access region_payment_gateways"
      ON public.region_payment_gateways FOR ALL
      USING (auth.jwt() ->> 'role' = 'service_role');
  END IF;
END $$;

-- ============================================================================
-- 4. region_secrets — service_role only (contains encrypted payment keys)
-- ============================================================================
ALTER TABLE IF EXISTS public.region_secrets ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'region_secrets' AND policyname = 'Service role full access region_secrets'
  ) THEN
    CREATE POLICY "Service role full access region_secrets"
      ON public.region_secrets FOR ALL
      USING (auth.jwt() ->> 'role' = 'service_role');
  END IF;
END $$;

-- ============================================================================
-- 5. Storage: tighten product-images bucket policies
-- Replace the broad "any authenticated user" write policies with provider-scoped
-- path policies so providers can only write to their own folder: {provider_id}/...
-- ============================================================================

-- Drop the old broad policies from migration 405
DROP POLICY IF EXISTS "Authenticated users can upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update product images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete product images" ON storage.objects;

-- Provider-scoped upload: path must start with the provider's own UUID folder
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Providers upload own product images'
  ) THEN
    CREATE POLICY "Providers upload own product images"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'product-images'
        AND (
          -- Service role bypasses path check (used by server-side upload)
          auth.jwt() ->> 'role' = 'service_role'
          OR (
            -- Path must start with the caller's user_id folder OR a provider_id
            -- the user owns/belongs to. We use the first path segment as the provider_id
            -- and verify membership via providers or provider_staff tables.
            EXISTS (
              SELECT 1 FROM public.providers p
              WHERE p.user_id = auth.uid()
                AND (storage.foldername(name))[1] = p.id::text
              UNION
              SELECT 1 FROM public.provider_staff ps
              WHERE ps.user_id = auth.uid()
                AND (storage.foldername(name))[1] = ps.provider_id::text
            )
          )
        )
      );
  END IF;
END $$;

-- Provider-scoped update
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Providers update own product images'
  ) THEN
    CREATE POLICY "Providers update own product images"
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (
        bucket_id = 'product-images'
        AND (
          auth.jwt() ->> 'role' = 'service_role'
          OR EXISTS (
            SELECT 1 FROM public.providers p
            WHERE p.user_id = auth.uid()
              AND (storage.foldername(name))[1] = p.id::text
            UNION
            SELECT 1 FROM public.provider_staff ps
            WHERE ps.user_id = auth.uid()
              AND (storage.foldername(name))[1] = ps.provider_id::text
          )
        )
      );
  END IF;
END $$;

-- Provider-scoped delete
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Providers delete own product images'
  ) THEN
    CREATE POLICY "Providers delete own product images"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'product-images'
        AND (
          auth.jwt() ->> 'role' = 'service_role'
          OR EXISTS (
            SELECT 1 FROM public.providers p
            WHERE p.user_id = auth.uid()
              AND (storage.foldername(name))[1] = p.id::text
            UNION
            SELECT 1 FROM public.provider_staff ps
            WHERE ps.user_id = auth.uid()
              AND (storage.foldername(name))[1] = ps.provider_id::text
          )
        )
      );
  END IF;
END $$;
