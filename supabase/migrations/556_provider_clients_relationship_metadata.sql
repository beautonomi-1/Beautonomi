-- Track how a customer became visible in a provider CRM.
-- This lets APIs safely handle exact-match links to existing platform users
-- without treating them like provider-created walk-in profiles.

ALTER TABLE public.provider_clients
  ADD COLUMN IF NOT EXISTS relationship_source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS privacy_level TEXT NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS source_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS linked_existing_platform_user BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.provider_clients
  DROP CONSTRAINT IF EXISTS provider_clients_relationship_source_check;

ALTER TABLE public.provider_clients
  ADD CONSTRAINT provider_clients_relationship_source_check
  CHECK (
    relationship_source IN (
      'manual',
      'manual_new_customer',
      'manual_existing_platform',
      'booking',
      'conversation',
      'sale',
      'product_order',
      'import'
    )
  );

ALTER TABLE public.provider_clients
  DROP CONSTRAINT IF EXISTS provider_clients_privacy_level_check;

ALTER TABLE public.provider_clients
  ADD CONSTRAINT provider_clients_privacy_level_check
  CHECK (privacy_level IN ('standard', 'limited'));

CREATE INDEX IF NOT EXISTS idx_provider_clients_relationship_source
  ON public.provider_clients(provider_id, relationship_source);

CREATE INDEX IF NOT EXISTS idx_provider_clients_linked_existing
  ON public.provider_clients(provider_id, linked_existing_platform_user)
  WHERE linked_existing_platform_user = true;

COMMENT ON COLUMN public.provider_clients.relationship_source IS
  'How this customer became visible to the provider CRM, e.g. manual_new_customer, manual_existing_platform, booking, conversation.';

COMMENT ON COLUMN public.provider_clients.privacy_level IS
  'standard exposes normal provider CRM fields; limited is used for exact-match links to existing platform users until a stronger relationship exists.';

COMMENT ON COLUMN public.provider_clients.source_metadata IS
  'Provider-scoped metadata about the relationship source, such as exact match type and provider-supplied contact fields.';
