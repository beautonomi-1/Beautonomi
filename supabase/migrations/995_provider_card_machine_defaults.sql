-- Per-location / per-staff default card machine for checkout UX.
CREATE TABLE IF NOT EXISTS public.provider_card_machine_defaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.provider_locations(id) ON DELETE CASCADE,
  staff_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  machine_provider text NOT NULL CHECK (machine_provider IN ('yoco', 'paycloud')),
  machine_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_card_machine_defaults_scope_chk CHECK (
    (location_id IS NOT NULL AND staff_user_id IS NULL)
    OR (location_id IS NULL AND staff_user_id IS NOT NULL)
    OR (location_id IS NULL AND staff_user_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS provider_card_machine_defaults_provider_location_uidx
  ON public.provider_card_machine_defaults (provider_id, location_id)
  WHERE location_id IS NOT NULL AND staff_user_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS provider_card_machine_defaults_provider_staff_uidx
  ON public.provider_card_machine_defaults (provider_id, staff_user_id)
  WHERE staff_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS provider_card_machine_defaults_provider_global_uidx
  ON public.provider_card_machine_defaults (provider_id)
  WHERE location_id IS NULL AND staff_user_id IS NULL;

ALTER TABLE public.provider_card_machine_defaults ENABLE ROW LEVEL SECURITY;

CREATE POLICY provider_card_machine_defaults_select ON public.provider_card_machine_defaults
  FOR SELECT TO authenticated
  USING (
    provider_id IN (
      SELECT id FROM public.providers WHERE user_id = auth.uid()
      UNION
      SELECT provider_id FROM public.provider_staff WHERE user_id = auth.uid()
    )
  );

CREATE POLICY provider_card_machine_defaults_write ON public.provider_card_machine_defaults
  FOR ALL TO authenticated
  USING (
    provider_id IN (
      SELECT id FROM public.providers WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    provider_id IN (
      SELECT id FROM public.providers WHERE user_id = auth.uid()
    )
  );
