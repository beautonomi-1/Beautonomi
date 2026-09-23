-- 928_learning_training_progress_and_coverage.sql
-- Per-user training sign-off, path completion, checkpoint quizzes,
-- commercial ops runbook, nav/runbook coverage updates, new commercial path.

-- ═══════════════════════════════════════════════════════════════════════════════
-- PROGRESS & COMPLETION
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.learning_training_progress (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  path_slug     TEXT        NOT NULL,
  article_slug  TEXT        NOT NULL,
  signed_off_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, path_slug, article_slug)
);

CREATE INDEX IF NOT EXISTS idx_learning_training_progress_user_path
  ON public.learning_training_progress(user_id, path_slug);

ALTER TABLE public.learning_training_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can manage learning training progress"
  ON public.learning_training_progress
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
        AND users.role = 'superadmin'
    )
  );

CREATE TABLE IF NOT EXISTS public.learning_training_completions (
  user_id         UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  path_slug       TEXT        NOT NULL,
  quiz_passed_at  TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  PRIMARY KEY (user_id, path_slug)
);

ALTER TABLE public.learning_training_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can manage learning training completions"
  ON public.learning_training_completions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
        AND users.role = 'superadmin'
    )
  );

ALTER TABLE public.learning_training_paths
  ADD COLUMN IF NOT EXISTS checkpoint_quiz JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.learning_training_paths.checkpoint_quiz IS
  'Checkpoint quiz: [{ id, prompt, choices, answer_index }]. answer_index omitted in reader API.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- COMMERCIAL OPS CATEGORY & RUNBOOK
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.learning_categories (title, slug, icon, sort_order, audience, visibility)
SELECT 'Commercial Operations', 'commercial-ops', NULL, 58, 'internal', 'internal'
WHERE NOT EXISTS (
  SELECT 1 FROM public.learning_categories c WHERE c.slug = 'commercial-ops'
);

INSERT INTO public.learning_articles
  (category_id, title, slug, summary, body, content_format, status, audience, is_internal, published_at)
SELECT c.id,
  'Commercial Operations Runbook',
  'commercial-ops-runbook',
  'Internal runbook: terminal commerce — insights, onboarding, products, orders, campaigns, reporting, vendors, pickup locations.',
  $body$<p>This internal runbook covers the Commercial Operations nav group (card machines and terminal commerce). It is not visible to customers or providers.</p>

<h2>Purpose</h2>
<p>Operate terminal hardware and merchant onboarding workflows: catalog, orders, campaigns, and fulfilment reporting.</p>

<h2>Who uses this section</h2>
<p>Finance and operations admins with <code>ADMIN_SECTION_COMMERCIAL</code> access (superadmin, admin_finance, admin_operations).</p>

<h2>Pages in this section</h2>
<ul>
  <li><strong>Terminal Insights</strong> (<code>/admin/commercial/terminal-insights</code>) — adoption and usage KPIs.</li>
  <li><strong>Terminal Onboarding</strong> (<code>/admin/commercial/terminal-onboarding</code>) — merchant application pipeline.</li>
  <li><strong>Terminal Products</strong> (<code>/admin/commercial/terminal-products</code>) — hardware SKUs and pricing.</li>
  <li><strong>Terminal Orders</strong> (<code>/admin/commercial/terminal-orders</code>) — order fulfilment and status.</li>
  <li><strong>Terminal Campaigns</strong> (<code>/admin/commercial/terminal-campaigns</code>) — promotional terminal offers.</li>
  <li><strong>Terminal Reporting</strong> (<code>/admin/commercial/terminal-reporting</code>) — revenue and activation reports.</li>
  <li><strong>Terminal Vendors</strong> (<code>/admin/commercial/terminal-vendors</code>) — vendor configuration.</li>
  <li><strong>Pickup Locations</strong> (<code>/admin/commercial/terminal-collection-locations</code>) — collection points for hardware.</li>
</ul>

<h2>Step-by-step tasks</h2>
<ol>
  <li><strong>Review a new merchant application:</strong> Terminal Onboarding → open application → verify documents → approve or request resubmission.</li>
  <li><strong>Fulfil a terminal order:</strong> Terminal Orders → open order → confirm payment → update fulfilment status → notify provider if required.</li>
  <li><strong>Launch a terminal campaign:</strong> Terminal Campaigns → create → set eligibility and dates → publish.</li>
</ol>

<h2>Common issues &amp; gotchas</h2>
<ul>
  <li>Terminal onboarding depends on identity and payout data — cross-check Users &amp; Trust and Finance before approving.</li>
  <li>Order status changes may trigger notification templates — preview copy before bulk updates.</li>
</ul>

<h2>Escalation</h2>
<p>PayCloud or vendor API failures → Platform team and Integrations runbook (PayCloud pages).</p>

<h2>Reference for replies</h2>
<ul>
  <li><a href="/learn/article/card-machines-application-guide">Card machine application guide</a></li>
  <li><a href="/learn/article/card-machines-before-you-apply">Documents before applying</a></li>
</ul>$body$,
  'html', 'published', 'internal', TRUE, NOW()
FROM public.learning_categories c
WHERE c.slug = 'commercial-ops'
AND NOT EXISTS (
  SELECT 1 FROM public.learning_articles a
  WHERE a.slug = 'commercial-ops-runbook' AND a.tenant_id IS NULL
);

-- New training path
INSERT INTO public.learning_training_paths (slug, title, role, description, sort_order, article_slugs)
SELECT
  'commercial-ops-operator',
  'Commercial Operations Operator',
  'commercial',
  'Training for terminal commerce: onboarding, orders, campaigns, and reporting.',
  7,
  ARRAY[
    'superadmin-operate-platform-overview',
    'commercial-ops-runbook',
    'finance-payouts-runbook',
    'integrations-dev-runbook',
    'admin-overview-runbook'
  ]
WHERE NOT EXISTS (
  SELECT 1 FROM public.learning_training_paths p WHERE p.slug = 'commercial-ops-operator'
);

-- Append commercial runbook to finance and superadmin paths (idempotent)
UPDATE public.learning_training_paths
SET article_slugs = article_slugs || ARRAY['commercial-ops-runbook'],
    updated_at = NOW()
WHERE slug = 'finance-payouts-operator'
  AND NOT ('commercial-ops-runbook' = ANY(article_slugs));

UPDATE public.learning_training_paths
SET article_slugs = article_slugs || ARRAY['commercial-ops-runbook'],
    updated_at = NOW()
WHERE slug = 'superadmin-full-platform'
  AND NOT ('commercial-ops-runbook' = ANY(article_slugs));

-- ═══════════════════════════════════════════════════════════════════════════════
-- PROVIDER OPS: My Day, AI queue, Retention
-- ═══════════════════════════════════════════════════════════════════════════════

UPDATE public.learning_articles
SET body = body || $append$
<h2>Provider Ops AI queue</h2>
<p><strong>Provider AI queue</strong> (<code>/admin/provider-ops/ai-queue</code>) — review pending agent suggestions for retention workflows. Approve, reject, or approve-and-send individually; bulk approve records decisions only and does not edit draft text. In shadow mode, approve-and-send does not execute. Payout-related reviews may require a second approver (maker-checker).</p>
$append$,
    updated_at = NOW()
WHERE slug = 'provider-ops-hub-runbook' AND tenant_id IS NULL
  AND body NOT LIKE '%/admin/provider-ops/ai-queue%';

UPDATE public.learning_articles
SET body = replace(body,
  '<li><strong>Lead Inbox</strong>',
  '<li><strong>My Day</strong> (<code>/admin/provider-ops/my-day</code>) — daily queue by desk (sales, onboarding, retention).</li>
  <li><strong>Retention Queue</strong> (<code>/admin/provider-ops/retention</code>) — at-risk providers and save workflows.</li>
  <li><strong>Lead Inbox</strong>'),
    updated_at = NOW()
WHERE slug = 'provider-ops-hub-runbook' AND tenant_id IS NULL
  AND body NOT LIKE '%/admin/provider-ops/my-day%';

-- ═══════════════════════════════════════════════════════════════════════════════
-- AI QUEUES: Support, Finance, Trust
-- ═══════════════════════════════════════════════════════════════════════════════

UPDATE public.learning_articles
SET body = body || $append$
<h2>Support AI drafts</h2>
<p><strong>Support AI drafts</strong> (<code>/admin/support-tickets/ai-drafts</code>) — review AI-generated ticket replies before sending. Approve, reject, or approve-and-send; bulk approve does not edit draft text. Shadow mode blocks execution on send.</p>
$append$,
    updated_at = NOW()
WHERE slug = 'support-desk-runbook' AND tenant_id IS NULL
  AND body NOT LIKE '%/admin/support-tickets/ai-drafts%';

UPDATE public.learning_articles
SET body = body || $append$
<h2>Finance AI queue</h2>
<p><strong>Finance AI queue</strong> (<code>/admin/finance/ai-queue</code>) — review finance agent actions (payouts, policy). Approve, reject, or approve-and-send where allowed. Payout reviews may stay pending until a second approver signs off.</p>
$append$,
    updated_at = NOW()
WHERE slug = 'finance-payouts-runbook' AND tenant_id IS NULL
  AND body NOT LIKE '%/admin/finance/ai-queue%';

UPDATE public.learning_articles
SET body = body || $append$
<h2>Trust AI queue</h2>
<p><strong>Trust AI queue</strong> (<code>/admin/trust-safety-ops/ai-queue</code>) — review trust and safety agent suggestions. Approve, reject, or approve-and-send per policy; shadow mode prevents automatic execution.</p>
$append$,
    updated_at = NOW()
WHERE slug = 'users-trust-runbook' AND tenant_id IS NULL
  AND body NOT LIKE '%/admin/trust-safety-ops/ai-queue%';

-- Didit instead of Sumsub in users-trust
UPDATE public.learning_articles
SET body = replace(body, 'Sumsub integration', 'Didit (identity / KYC) integration'),
    updated_at = NOW()
WHERE slug = 'users-trust-runbook' AND tenant_id IS NULL
  AND body LIKE '%Sumsub integration%';

-- ═══════════════════════════════════════════════════════════════════════════════
-- INTEGRATIONS RUNBOOK: Didit, AI Platform, PayCloud, OneSignal, Agentic Console
-- ═══════════════════════════════════════════════════════════════════════════════

UPDATE public.learning_articles
SET summary = 'Internal runbook: webhooks, API keys, Didit, AI Platform, Aura, Amplitude, Slack, Resend, Paystack, Yoco, PayCloud, Mapbox, OneSignal, WhatsApp, and ISO codes.',
    body = replace(replace(replace(replace(replace(replace(replace(replace(body,
      'Sumsub, Gemini', 'Didit, AI Platform'),
      '<li><strong>Sumsub</strong> (<code>/admin/control-plane/integrations/sumsub</code>)', '<li><strong>Didit (Identity / KYC)</strong> (<code>/admin/control-plane/integrations/didit</code>)'),
      '<li><strong>Gemini</strong> (<code>/admin/control-plane/integrations/gemini</code>)', '<li><strong>AI Platform</strong> (<code>/admin/control-plane/integrations/ai</code>)'),
      'Integrations Hub, Sumsub, Gemini, Aura', 'Integrations Hub, Didit, AI Platform, Aura'),
      'Sumsub webhook', 'Didit webhook'),
      '<li><strong>OneSignal (push)</strong> (<code>/admin/notifications</code>)', '<li><strong>OneSignal</strong> (<code>/admin/integrations/onesignal</code>)'),
      '<li><strong>ISO Codes</strong>', '<li><strong>Agentic Console</strong> (<code>/admin/control-plane/modules/agents</code>) <em>[Superadmin]</em> — agent workforce console.</li>
  <li><strong>PayCloud</strong> (<code>/admin/integrations/paycloud</code>, <code>/admin/integrations/paycloud-operations</code>) <em>[Superadmin]</em> — card machine payment integration.</li>
  <li><strong>ISO Codes</strong>'),
    updated_at = NOW()
WHERE slug = 'integrations-dev-runbook' AND tenant_id IS NULL;

UPDATE public.learning_articles
SET body = replace(body, '<li><strong>Aura</strong> (<code>/admin/control-plane/integrations/aura</code>) <em>[Superadmin]</em> — real-time analytics pipeline.</li>',
  '<li><strong>Aura (trust &amp; safety)</strong> (<code>/admin/control-plane/integrations/aura</code>) <em>[Superadmin]</em> — trust and safety integration.</li>'),
    updated_at = NOW()
WHERE slug = 'integrations-dev-runbook' AND tenant_id IS NULL
  AND body LIKE '%real-time analytics pipeline%';

-- Master overview: integrations paragraph
UPDATE public.learning_articles
SET body = replace(body,
  'Sumsub [Superadmin], Gemini [Superadmin]',
  'Didit (Identity / KYC) [Superadmin], AI Platform [Superadmin], Agentic Console [Superadmin]'),
    updated_at = NOW()
WHERE slug = 'superadmin-operate-platform-overview' AND tenant_id IS NULL
  AND body LIKE '%Sumsub [Superadmin]%';

UPDATE public.learning_articles
SET body = replace(body,
  '<p>Dashboard, Gods Eye [Superadmin], Analytics [Superadmin], Geo &amp; Devices [Superadmin], Reports, and the Knowledge Base itself.',
  '<p>Dashboard, Analytics [Superadmin], Geo &amp; Devices [Superadmin], Reports, and the Knowledge Base itself.'),
    updated_at = NOW()
WHERE slug = 'superadmin-operate-platform-overview' AND tenant_id IS NULL
  AND body LIKE '%Gods Eye [Superadmin]%';

-- Admin overview runbook: remove Gods Eye from overview list
UPDATE public.learning_articles
SET summary = 'Internal runbook: the Overview section — Dashboard, Analytics, Geo & Devices, Reports, and Knowledge Base.',
    body = replace(replace(body,
      'Gods Eye, Analytics', 'Analytics'),
      '<li><strong>Gods Eye</strong> (<code>/admin/gods-eye</code>) <em>[Superadmin]</em> — live map of bookings and providers in real-time.</li>', ''),
    updated_at = NOW()
WHERE slug = 'admin-overview-runbook' AND tenant_id IS NULL
  AND body LIKE '%/admin/gods-eye%';

UPDATE public.learning_articles
SET body = replace(body, '<li><strong>Superadmin only</strong> — Gods Eye, Analytics', '<li><strong>Superadmin only</strong> — Analytics'),
    updated_at = NOW()
WHERE slug = 'admin-overview-runbook' AND tenant_id IS NULL;

-- Platform operations: Gods Eye
UPDATE public.learning_articles
SET body = body || $append$
<h2>Gods Eye</h2>
<p><strong>Gods Eye</strong> (<code>/admin/gods-eye</code>) <em>[Superadmin]</em> — live map of bookings and providers. Use with Analytics when investigating geographic spikes.</p>
$append$,
    updated_at = NOW()
WHERE slug = 'platform-operations-runbook' AND tenant_id IS NULL
  AND body NOT LIKE '%<h2>Gods Eye</h2>%';

-- Master overview: commercial section link
UPDATE public.learning_articles
SET body = body || $append$
<h2>Commercial Operations</h2>
<p>Terminal commerce: insights, onboarding, products, orders, campaigns, reporting, vendors, pickup locations. See runbook: <a href="/admin/knowledge-base/commercial-ops-runbook">Commercial Operations Runbook</a>.</p>
$append$,
    updated_at = NOW()
WHERE slug = 'superadmin-operate-platform-overview' AND tenant_id IS NULL
  AND body NOT LIKE '%commercial-ops-runbook%';

-- ═══════════════════════════════════════════════════════════════════════════════
-- CHECKPOINT QUIZZES (3 questions per path; idempotent by empty quiz only)
-- ═══════════════════════════════════════════════════════════════════════════════

UPDATE public.learning_training_paths SET checkpoint_quiz = '[
  {"id":"q1","prompt":"Where do support agents triage customer tickets?","choices":["/admin/support-tickets","/admin/provider-ops/leads","/admin/bookings"],"answer_index":0},
  {"id":"q2","prompt":"Internal runbooks are visible on the public /learn site.","choices":["True","False"],"answer_index":1},
  {"id":"q3","prompt":"Which page lists AI-generated ticket drafts for review?","choices":["/admin/support-tickets/ai-drafts","/admin/content/learning","/admin/notifications"],"answer_index":0}
]'::jsonb, updated_at = NOW()
WHERE slug = 'new-support-agent' AND checkpoint_quiz = '[]'::jsonb;

UPDATE public.learning_training_paths SET checkpoint_quiz = '[
  {"id":"q1","prompt":"Where is the provider pipeline kanban board?","choices":["/admin/provider-ops/pipeline","/admin/providers","/admin/provider-ops/reports"],"answer_index":0},
  {"id":"q2","prompt":"Activation should happen before verification is Approved.","choices":["True","False"],"answer_index":1},
  {"id":"q3","prompt":"Which queue handles at-risk provider retention?","choices":["/admin/provider-ops/retention","/admin/provider-ops/leads","/admin/refunds"],"answer_index":0}
]'::jsonb, updated_at = NOW()
WHERE slug = 'provider-ops-specialist' AND checkpoint_quiz = '[]'::jsonb;

UPDATE public.learning_training_paths SET checkpoint_quiz = '[
  {"id":"q1","prompt":"Where are payout approvals processed?","choices":["/admin/payouts","/admin/promotions","/admin/catalog"],"answer_index":0},
  {"id":"q2","prompt":"Finance AI queue actions may require a second approver for payouts.","choices":["True","False"],"answer_index":0},
  {"id":"q3","prompt":"Terminal commerce lives under which nav group?","choices":["Commercial Operations","Marketing","Content"],"answer_index":0}
]'::jsonb, updated_at = NOW()
WHERE slug = 'finance-payouts-operator' AND checkpoint_quiz = '[]'::jsonb;

UPDATE public.learning_training_paths SET checkpoint_quiz = '[
  {"id":"q1","prompt":"Identity verification integration in admin is configured at:","choices":["/admin/control-plane/integrations/didit","/admin/control-plane/integrations/sumsub","/admin/settings"],"answer_index":0},
  {"id":"q2","prompt":"Trust AI queue is at /admin/trust-safety-ops/ai-queue.","choices":["True","False"],"answer_index":0},
  {"id":"q3","prompt":"User blocks are managed under:","choices":["Trust & Safety Ops","Finance","E-commerce"],"answer_index":0}
]'::jsonb, updated_at = NOW()
WHERE slug = 'trust-safety-reviewer' AND checkpoint_quiz = '[]'::jsonb;

UPDATE public.learning_training_paths SET checkpoint_quiz = '[
  {"id":"q1","prompt":"Learning Center articles for customers are authored at:","choices":["/admin/content/learning","/admin/knowledge-base","/admin/explore"],"answer_index":0},
  {"id":"q2","prompt":"is_internal articles appear on beautonomi.com /learn.","choices":["True","False"],"answer_index":1},
  {"id":"q3","prompt":"WhatsApp content templates for marketing are at:","choices":["/admin/whatsapp-content-templates","/admin/whatsapp/sessions","/admin/sms-templates"],"answer_index":0}
]'::jsonb, updated_at = NOW()
WHERE slug = 'content-marketing-manager' AND checkpoint_quiz = '[]'::jsonb;

UPDATE public.learning_training_paths SET checkpoint_quiz = '[
  {"id":"q1","prompt":"Gods Eye live map is at:","choices":["/admin/gods-eye","/admin/dashboard","/admin/analytics"],"answer_index":0},
  {"id":"q2","prompt":"Feature flags are under Platform Config.","choices":["True","False"],"answer_index":0},
  {"id":"q3","prompt":"Agentic Console URL:","choices":["/admin/control-plane/modules/agents","/admin/control-plane/integrations/gemini","/admin/provider-ops/ai-queue"],"answer_index":0}
]'::jsonb, updated_at = NOW()
WHERE slug = 'superadmin-full-platform' AND checkpoint_quiz = '[]'::jsonb;

UPDATE public.learning_training_paths SET checkpoint_quiz = '[
  {"id":"q1","prompt":"Terminal merchant applications are reviewed at:","choices":["/admin/commercial/terminal-onboarding","/admin/bookings","/admin/payouts"],"answer_index":0},
  {"id":"q2","prompt":"Commercial Operations includes terminal orders and campaigns.","choices":["True","False"],"answer_index":0},
  {"id":"q3","prompt":"Pickup locations for hardware are at:","choices":["/admin/commercial/terminal-collection-locations","/admin/service-zones","/admin/mapbox"],"answer_index":0}
]'::jsonb, updated_at = NOW()
WHERE slug = 'commercial-ops-operator' AND checkpoint_quiz = '[]'::jsonb;
