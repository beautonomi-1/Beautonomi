-- Allow authenticated customers to manage recurring series they own (customer portal API).

DROP POLICY IF EXISTS "Customers can select own recurring appointments" ON public.recurring_appointments;
CREATE POLICY "Customers can select own recurring appointments"
    ON public.recurring_appointments FOR SELECT
    USING (customer_id IS NOT NULL AND customer_id = auth.uid());

DROP POLICY IF EXISTS "Customers can insert own recurring appointments" ON public.recurring_appointments;
CREATE POLICY "Customers can insert own recurring appointments"
    ON public.recurring_appointments FOR INSERT
    WITH CHECK (customer_id IS NOT NULL AND customer_id = auth.uid());

DROP POLICY IF EXISTS "Customers can update own recurring appointments" ON public.recurring_appointments;
CREATE POLICY "Customers can update own recurring appointments"
    ON public.recurring_appointments FOR UPDATE
    USING (customer_id IS NOT NULL AND customer_id = auth.uid())
    WITH CHECK (customer_id IS NOT NULL AND customer_id = auth.uid());

DROP POLICY IF EXISTS "Customers can delete own recurring appointments" ON public.recurring_appointments;
CREATE POLICY "Customers can delete own recurring appointments"
    ON public.recurring_appointments FOR DELETE
    USING (customer_id IS NOT NULL AND customer_id = auth.uid());
