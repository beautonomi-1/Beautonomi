-- Mirror sale_items RLS for sale_payments (migration 989 enabled RLS without policies).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'sale_payments'
      AND policyname = 'Providers can view sale payments for their sales'
  ) THEN
    CREATE POLICY "Providers can view sale payments for their sales"
      ON public.sale_payments FOR SELECT
      USING (
        sale_id IN (
          SELECT id FROM public.sales WHERE provider_id IN (
            SELECT id FROM public.providers WHERE user_id = auth.uid()
            UNION
            SELECT provider_id FROM public.provider_staff WHERE user_id = auth.uid()
          )
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'sale_payments'
      AND policyname = 'Providers can create sale payments for their sales'
  ) THEN
    CREATE POLICY "Providers can create sale payments for their sales"
      ON public.sale_payments FOR INSERT
      WITH CHECK (
        sale_id IN (
          SELECT id FROM public.sales WHERE provider_id IN (
            SELECT id FROM public.providers WHERE user_id = auth.uid()
            UNION
            SELECT provider_id FROM public.provider_staff WHERE user_id = auth.uid()
          )
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'sale_payments'
      AND policyname = 'Providers can update sale payments for their sales'
  ) THEN
    CREATE POLICY "Providers can update sale payments for their sales"
      ON public.sale_payments FOR UPDATE
      USING (
        sale_id IN (
          SELECT id FROM public.sales WHERE provider_id IN (
            SELECT id FROM public.providers WHERE user_id = auth.uid()
            UNION
            SELECT provider_id FROM public.provider_staff WHERE user_id = auth.uid()
          )
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'sale_payments'
      AND policyname = 'Providers can delete sale payments for their sales'
  ) THEN
    CREATE POLICY "Providers can delete sale payments for their sales"
      ON public.sale_payments FOR DELETE
      USING (
        sale_id IN (
          SELECT id FROM public.sales WHERE provider_id IN (
            SELECT id FROM public.providers WHERE user_id = auth.uid()
            UNION
            SELECT provider_id FROM public.provider_staff WHERE user_id = auth.uid()
          )
        )
      );
  END IF;
END $$;
