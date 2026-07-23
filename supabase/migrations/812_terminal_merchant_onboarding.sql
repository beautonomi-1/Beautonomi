-- ============================================================================
-- 812: Terminal merchant onboarding (FICA + acquirer term sheet tracking)
-- ============================================================================

CREATE SEQUENCE IF NOT EXISTS public.terminal_merchant_application_no_seq START 1;

CREATE TYPE public.terminal_merchant_application_status AS ENUM (
  'draft',
  'submitted',
  'in_review',
  'info_required',
  'sent_to_acquirer',
  'awaiting_term_sheet',
  'approved',
  'declined',
  'cancelled'
);

CREATE TYPE public.terminal_merchant_id_type AS ENUM (
  'national_id',
  'passport',
  'foreign_id'
);

CREATE TYPE public.terminal_merchant_entity_type AS ENUM (
  'sole_proprietor',
  'private_company',
  'close_corporation',
  'partnership',
  'trust',
  'npo',
  'other'
);

CREATE TYPE public.terminal_merchant_account_type AS ENUM (
  'cheque_current',
  'savings',
  'transmission'
);

CREATE TYPE public.terminal_merchant_fulfillment_method AS ENUM (
  'delivery',
  'collection'
);

CREATE TYPE public.terminal_merchant_term_sheet_status AS ENUM (
  'pending',
  'sent',
  'accepted',
  'declined',
  'expired'
);

CREATE TYPE public.terminal_merchant_doc_type AS ENUM (
  'id_document',
  'proof_of_address',
  'bank_confirmation_letter',
  'company_registration',
  'trust_deed',
  'resolution_letter',
  'other'
);

CREATE TYPE public.terminal_merchant_doc_status AS ENUM (
  'pending',
  'approved',
  'rejected'
);

CREATE TABLE IF NOT EXISTS public.terminal_merchant_applications (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_no              TEXT NOT NULL UNIQUE DEFAULT (
    'TMO-' || lpad(nextval('public.terminal_merchant_application_no_seq')::text, 6, '0')
  ),
  tenant_id                   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider_id                 UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  vendor_slug                 TEXT NOT NULL DEFAULT 'paycloud',
  status                      public.terminal_merchant_application_status NOT NULL DEFAULT 'draft',

  -- Personal
  first_name                  TEXT,
  last_name                   TEXT,
  email                       TEXT,
  phone                       TEXT,
  id_type                     public.terminal_merchant_id_type,
  id_number                   TEXT,

  -- Business
  entity_type                 public.terminal_merchant_entity_type,
  legal_name                  TEXT,
  trading_name                TEXT,
  registration_number         TEXT,
  vat_number                  TEXT,
  mcc                         TEXT NOT NULL DEFAULT '7230',

  -- Physical address
  physical_line1              TEXT,
  physical_suburb             TEXT,
  physical_city               TEXT,
  physical_province           TEXT,
  physical_postal_code        TEXT,
  physical_country            TEXT NOT NULL DEFAULT 'ZA',

  postal_same_as_physical     BOOLEAN NOT NULL DEFAULT true,
  postal_line1                TEXT,
  postal_suburb               TEXT,
  postal_city                 TEXT,
  postal_province             TEXT,
  postal_postal_code          TEXT,
  postal_country              TEXT NOT NULL DEFAULT 'ZA',

  -- Banking
  bank_code                   TEXT,
  bank_name                   TEXT,
  account_type                public.terminal_merchant_account_type,
  account_holder              TEXT,
  account_number_encrypted    TEXT,
  account_number_last4        TEXT,

  -- Fulfillment preference
  fulfillment_method          public.terminal_merchant_fulfillment_method,
  delivery_line1              TEXT,
  delivery_suburb             TEXT,
  delivery_city               TEXT,
  delivery_province           TEXT,
  delivery_postal_code        TEXT,
  delivery_country            TEXT NOT NULL DEFAULT 'ZA',
  collection_location_id      UUID REFERENCES public.terminal_collection_locations(id) ON DELETE SET NULL,

  -- Term sheet (tracked on acquirer platform)
  otp_phone                   TEXT,
  term_sheet_status           public.terminal_merchant_term_sheet_status NOT NULL DEFAULT 'pending',
  term_sheet_sent_at          TIMESTAMPTZ,
  term_sheet_accepted_at      TIMESTAMPTZ,

  -- Review checklist (staff toggles)
  section_personal_verified   BOOLEAN NOT NULL DEFAULT false,
  section_business_verified   BOOLEAN NOT NULL DEFAULT false,
  section_address_verified    BOOLEAN NOT NULL DEFAULT false,
  section_banking_verified    BOOLEAN NOT NULL DEFAULT false,
  section_documents_verified  BOOLEAN NOT NULL DEFAULT false,
  section_fulfillment_verified BOOLEAN NOT NULL DEFAULT false,

  info_required_sections      TEXT[] NOT NULL DEFAULT '{}',
  info_required_reason        TEXT,

  -- Ops
  assigned_admin_id           UUID REFERENCES public.users(id) ON DELETE SET NULL,
  acquirer_reference          TEXT,
  decline_reason              TEXT,
  paycloud_merchant_id        UUID REFERENCES public.paycloud_merchants(id) ON DELETE SET NULL,
  support_ticket_id           UUID REFERENCES public.support_tickets(id) ON DELETE SET NULL,

  submitted_at                TIMESTAMPTZ,
  approved_at                 TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),

  metadata                    JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_terminal_merchant_app_active_provider_vendor
  ON public.terminal_merchant_applications(provider_id, vendor_slug)
  WHERE status NOT IN ('approved', 'declined', 'cancelled');

CREATE INDEX IF NOT EXISTS idx_terminal_merchant_applications_status
  ON public.terminal_merchant_applications(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_terminal_merchant_applications_tenant
  ON public.terminal_merchant_applications(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_terminal_merchant_applications_assigned
  ON public.terminal_merchant_applications(assigned_admin_id)
  WHERE assigned_admin_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.terminal_merchant_application_documents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id    UUID NOT NULL REFERENCES public.terminal_merchant_applications(id) ON DELETE CASCADE,
  doc_type          public.terminal_merchant_doc_type NOT NULL,
  storage_path      TEXT NOT NULL,
  file_name         TEXT,
  mime_type         TEXT,
  status            public.terminal_merchant_doc_status NOT NULL DEFAULT 'pending',
  rejection_reason  TEXT,
  uploaded_by       UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_by       UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_terminal_merchant_app_docs_application
  ON public.terminal_merchant_application_documents(application_id, doc_type);

CREATE TABLE IF NOT EXISTS public.terminal_merchant_application_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id    UUID NOT NULL REFERENCES public.terminal_merchant_applications(id) ON DELETE CASCADE,
  event_type        TEXT NOT NULL,
  actor_user_id     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  actor_role        TEXT,
  message           TEXT,
  payload           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_terminal_merchant_app_events_application
  ON public.terminal_merchant_application_events(application_id, created_at DESC);

-- Link terminal orders to merchant applications
ALTER TABLE public.terminal_orders
  ADD COLUMN IF NOT EXISTS merchant_application_id UUID
    REFERENCES public.terminal_merchant_applications(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_terminal_orders_merchant_application
  ON public.terminal_orders(merchant_application_id)
  WHERE merchant_application_id IS NOT NULL;

-- Extend integration_setup_status for merchant onboarding gate
ALTER TABLE public.terminal_orders
  DROP CONSTRAINT IF EXISTS terminal_orders_integration_setup_status_check;

ALTER TABLE public.terminal_orders
  ADD CONSTRAINT terminal_orders_integration_setup_status_check
  CHECK (integration_setup_status IN (
    'not_required',
    'pending',
    'in_progress',
    'completed',
    'awaiting_merchant_onboarding'
  ));

-- Support ticket context for terminal merchant applications
ALTER TABLE public.support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_context_type_check;

ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_context_type_check
  CHECK (
    support_context_type IS NULL OR support_context_type IN (
      'booking',
      'product_order',
      'gift_card',
      'payment',
      'provider_onboarding',
      'terminal_merchant_application',
      'account',
      'technical',
      'other'
    )
  );

-- RLS
ALTER TABLE public.terminal_merchant_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.terminal_merchant_application_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.terminal_merchant_application_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY terminal_merchant_applications_service_role
  ON public.terminal_merchant_applications
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY terminal_merchant_app_docs_service_role
  ON public.terminal_merchant_application_documents
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY terminal_merchant_app_events_service_role
  ON public.terminal_merchant_application_events
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Notification templates
INSERT INTO public.notification_templates (key, title, body, channels, variables, enabled, description)
SELECT key, title, body, channels, variables, true, description
FROM (
  VALUES
    (
      'terminal_merchant_application_submitted',
      'Card machine application received',
      'Hi {{business_name}}, we received your card machine application {{application_no}}. Our team will review it shortly.',
      ARRAY['push', 'email'],
      ARRAY['business_name', 'application_no', 'application_id', 'app_url'],
      'Sent when a provider submits a terminal merchant application.'
    ),
    (
      'terminal_merchant_application_info_required',
      'More info needed for your card machine application',
      'Hi {{business_name}}, we need a few updates for application {{application_no}}: {{info_reason}}',
      ARRAY['push', 'email'],
      ARRAY['business_name', 'application_no', 'application_id', 'info_reason', 'app_url'],
      'Sent when support requests more information on a terminal merchant application.'
    ),
    (
      'terminal_merchant_application_term_sheet_sent',
      'Term sheet on its way',
      'Hi {{business_name}}, watch {{otp_phone}} for an SMS from our terminal partner to accept your term sheet for application {{application_no}}.',
      ARRAY['push', 'email'],
      ARRAY['business_name', 'application_no', 'application_id', 'otp_phone', 'app_url'],
      'Sent when the acquirer term sheet has been sent to the merchant phone.'
    ),
    (
      'terminal_merchant_application_approved',
      'Card machine application approved',
      'Hi {{business_name}}, application {{application_no}} is approved. We will dispatch your terminal soon.',
      ARRAY['push', 'email'],
      ARRAY['business_name', 'application_no', 'application_id', 'app_url'],
      'Sent when a terminal merchant application is approved.'
    ),
    (
      'terminal_merchant_application_declined',
      'Card machine application update',
      'Hi {{business_name}}, application {{application_no}} could not be approved: {{decline_reason}}',
      ARRAY['push', 'email'],
      ARRAY['business_name', 'application_no', 'application_id', 'decline_reason', 'app_url'],
      'Sent when a terminal merchant application is declined.'
    )
) AS t(key, title, body, channels, variables, description)
WHERE NOT EXISTS (
  SELECT 1 FROM public.notification_templates nt WHERE nt.key = t.key
);

COMMENT ON TABLE public.terminal_merchant_applications IS
  'Provider FICA/merchant onboarding applications for terminal acquirers (PayCloud).';
