-- 720_learning_training_paths.sql
-- Introduces role-based training paths for internal staff:
--   - learning_training_paths table (ordered article slugs per role)
--   - RLS: superadmin can manage; service_role reads via API
--   - Seed: 6 training paths aligned to admin roles
-- Idempotent: CREATE TABLE IF NOT EXISTS; INSERT ... WHERE NOT EXISTS.

-- ═══════════════════════════════════════════════════════════════════════════════
-- TABLE
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.learning_training_paths (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT        NOT NULL UNIQUE,
  title       TEXT        NOT NULL,
  role        TEXT        NOT NULL,
  description TEXT,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  article_slugs TEXT[]    NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_learning_training_paths_slug
  ON public.learning_training_paths(slug);

CREATE INDEX IF NOT EXISTS idx_learning_training_paths_sort
  ON public.learning_training_paths(sort_order);

COMMENT ON TABLE public.learning_training_paths IS
  'Role-based ordered training curricula. Each path is an ordered list of learning_articles slugs.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- RLS
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.learning_training_paths ENABLE ROW LEVEL SECURITY;

-- Public (anon / authenticated) cannot see training paths at all.
-- The API reads using service_role, which bypasses RLS.
-- Mirrors the superadmin policy convention used by the other learning tables
-- (see 304_learning_center_tables.sql): check public.users.role.

CREATE POLICY "Superadmins can manage learning training paths"
  ON public.learning_training_paths
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
        AND users.role = 'superadmin'
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- SEED — 6 TRAINING PATHS
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. New support agent
INSERT INTO public.learning_training_paths (slug, title, role, description, sort_order, article_slugs)
SELECT
  'new-support-agent',
  'New Support Agent',
  'support',
  'Onboarding curriculum for new support desk agents. Covers the platform from a customer and provider perspective, then dives into the support workflow, dispute resolution, and refund processing.',
  1,
  ARRAY[
    'superadmin-operate-platform-overview',
    'support-desk-runbook',
    'disputes-refund-ops-overview',
    'providers-bookings-runbook',
    'admin-overview-runbook',
    'learning-center-authoring-guide'
  ]
WHERE NOT EXISTS (
  SELECT 1 FROM public.learning_training_paths p
  WHERE p.slug = 'new-support-agent'
);

-- 2. Provider Ops Specialist
INSERT INTO public.learning_training_paths (slug, title, role, description, sort_order, article_slugs)
SELECT
  'provider-ops-specialist',
  'Provider Ops Specialist',
  'provider_ops',
  'Training path for provider acquisition and onboarding specialists. Covers the provider pipeline, verification workflow, and provider operations.',
  2,
  ARRAY[
    'superadmin-operate-platform-overview',
    'provider-ops-hub-runbook',
    'verification-ops-overview',
    'providers-bookings-runbook',
    'expansion-playbook-overview',
    'admin-overview-runbook'
  ]
WHERE NOT EXISTS (
  SELECT 1 FROM public.learning_training_paths p
  WHERE p.slug = 'provider-ops-specialist'
);

-- 3. Finance & Payouts Operator
INSERT INTO public.learning_training_paths (slug, title, role, description, sort_order, article_slugs)
SELECT
  'finance-payouts-operator',
  'Finance & Payouts Operator',
  'finance',
  'Training path for the finance team. Covers the full finance section, payout approvals, fee configuration, wallet reconciliation, and billing operations.',
  3,
  ARRAY[
    'superadmin-operate-platform-overview',
    'finance-payouts-runbook',
    'billing-ops-overview',
    'disputes-refund-ops-overview',
    'providers-bookings-runbook',
    'admin-overview-runbook'
  ]
WHERE NOT EXISTS (
  SELECT 1 FROM public.learning_training_paths p
  WHERE p.slug = 'finance-payouts-operator'
);

-- 4. Trust & Safety / Verification Reviewer
INSERT INTO public.learning_training_paths (slug, title, role, description, sort_order, article_slugs)
SELECT
  'trust-safety-reviewer',
  'Trust & Safety / Verification Reviewer',
  'trust',
  'Training path for the trust, safety, and verification team. Covers user account management, identity verification, moderation, and incident response.',
  4,
  ARRAY[
    'superadmin-operate-platform-overview',
    'users-trust-runbook',
    'verification-ops-overview',
    'moderation-safety-ops-overview',
    'incident-response-overview',
    'providers-bookings-runbook',
    'support-desk-runbook'
  ]
WHERE NOT EXISTS (
  SELECT 1 FROM public.learning_training_paths p
  WHERE p.slug = 'trust-safety-reviewer'
);

-- 5. Content & Marketing Manager
INSERT INTO public.learning_training_paths (slug, title, role, description, sort_order, article_slugs)
SELECT
  'content-marketing-manager',
  'Content & Marketing Manager',
  'content_marketing',
  'Training path for content editors and marketing managers. Covers Learning Center authoring, catalog management, promotions, loyalty, broadcast, and notification templates.',
  5,
  ARRAY[
    'superadmin-operate-platform-overview',
    'learning-center-authoring-guide',
    'content-catalog-runbook',
    'marketing-comms-runbook',
    'ecommerce-runbook',
    'admin-overview-runbook'
  ]
WHERE NOT EXISTS (
  SELECT 1 FROM public.learning_training_paths p
  WHERE p.slug = 'content-marketing-manager'
);

-- 6. Superadmin — Full Platform
INSERT INTO public.learning_training_paths (slug, title, role, description, sort_order, article_slugs)
SELECT
  'superadmin-full-platform',
  'Superadmin — Full Platform',
  'superadmin',
  'Comprehensive training path for superadmins. Covers every section of the admin platform including superadmin-only areas: tenants, control plane, feature flags, integrations, and platform config.',
  6,
  ARRAY[
    'superadmin-operate-platform-overview',
    'admin-overview-runbook',
    'support-desk-runbook',
    'provider-ops-hub-runbook',
    'providers-bookings-runbook',
    'finance-payouts-runbook',
    'billing-ops-overview',
    'users-trust-runbook',
    'verification-ops-overview',
    'moderation-safety-ops-overview',
    'content-catalog-runbook',
    'learning-center-authoring-guide',
    'ecommerce-runbook',
    'marketing-comms-runbook',
    'integrations-dev-runbook',
    'platform-operations-runbook',
    'incident-response-overview',
    'expansion-playbook-overview',
    'platform-config-runbook',
    'disputes-refund-ops-overview'
  ]
WHERE NOT EXISTS (
  SELECT 1 FROM public.learning_training_paths p
  WHERE p.slug = 'superadmin-full-platform'
);
