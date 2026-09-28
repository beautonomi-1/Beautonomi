-- 964_learning_brand_grc_and_nav_coverage.sql
-- Brand desk + Security & Compliance runbooks, nav coverage patches, two training paths.

INSERT INTO public.learning_categories (title, slug, icon, sort_order, audience, visibility)
SELECT v.title, v.slug, v.icon, v.sort_order, v.audience, v.visibility
FROM (VALUES
  ('Brand Desk Operations', 'brand-desk-ops', NULL, 59, 'internal', 'internal'),
  ('Security & Compliance Ops', 'security-compliance-ops', NULL, 60, 'internal', 'internal')
) AS v(title, slug, icon, sort_order, audience, visibility)
WHERE NOT EXISTS (
  SELECT 1 FROM public.learning_categories c WHERE c.slug = v.slug
);

INSERT INTO public.learning_articles
  (category_id, title, slug, summary, body, content_format, status, audience, is_internal, published_at)
SELECT c.id,
  'Brand Desk Runbook',
  'brand-desk-runbook',
  'Internal runbook: brand briefs, campaign board, weekly metrics, pack export, and brand settings (feature flag brand_desk).',
  $body$<p>This internal runbook covers the Brand desk nav group. It is not visible to customers or providers. Requires the <code>brand_desk</code> feature flag.</p>

<h2>Purpose</h2>
<p>Plan and track brand marketing campaigns: intake briefs, move campaigns on the board, record weekly metrics, export packs, and configure approvers.</p>

<h2>Who uses this section</h2>
<p>Marketing and brand admins with access to Marketing nav and the brand_desk flag.</p>

<h2>Pages in this section</h2>
<ul>
  <li><strong>My work</strong> (<code>/admin/brand</code>) — dashboard: briefs in review, live campaigns, weekly update tasks.</li>
  <li><strong>Briefs</strong> (<code>/admin/brand/briefs</code>) — create and edit campaign briefs; open <code>/admin/brand/briefs/:id</code> to review and approve or reject.</li>
  <li><strong>Board</strong> (<code>/admin/brand/board</code>) — kanban of campaigns by stage; open <code>/admin/brand/campaigns/:id</code> for detail, placements, audience, metrics, clone.</li>
  <li><strong>Weekly update</strong> (<code>/admin/brand/weekly-update</code>) — enter or import CSV metrics for the reporting period.</li>
  <li><strong>Pack</strong> (<code>/admin/brand/pack</code>) — period pack view and export for stakeholders.</li>
  <li><strong>Brand settings</strong> (<code>/admin/brand/settings</code>) — approvers, stages, and desk configuration.</li>
</ul>

<h2>Step-by-step tasks</h2>
<ol>
  <li><strong>Intake a brief:</strong> Briefs → New → fill scope and dates → Submit for review.</li>
  <li><strong>Approve a brief:</strong> Open brief → Review → Approve (creates or links campaign) or request changes.</li>
  <li><strong>Advance a campaign:</strong> Board → drag card or open campaign → update stage (may require approver per settings).</li>
  <li><strong>Record weekly metrics:</strong> Weekly update → enter rows or parse CSV → Save.</li>
  <li><strong>Export a pack:</strong> Pack → choose period → Export.</li>
</ol>

<h2>Common issues &amp; gotchas</h2>
<ul>
  <li>Brand data is tenant-scoped — pick the correct market before working the desk.</li>
  <li>Stage changes may require marketing admin approval — check Brand settings.</li>
  <li>Campaign detail metrics depend on the selected reporting period.</li>
</ul>

<h2>Escalation</h2>
<p>Integration or API errors on brand endpoints → Platform team and Integrations runbook.</p>

<h2>Reference</h2>
<p>See also <a href="/admin/knowledge-base/marketing-comms-runbook">Marketing &amp; Comms Ops Runbook</a>.</p>$body$,
  'html', 'published', 'internal', TRUE, NOW()
FROM public.learning_categories c
WHERE c.slug = 'brand-desk-ops'
AND NOT EXISTS (
  SELECT 1 FROM public.learning_articles a
  WHERE a.slug = 'brand-desk-runbook' AND a.tenant_id IS NULL
);

INSERT INTO public.learning_articles
  (category_id, title, slug, summary, body, content_format, status, audience, is_internal, published_at)
SELECT c.id,
  'Security & Compliance (GRC) Runbook',
  'security-compliance-runbook',
  'Internal runbook: GRC hub — controls, policies, risks, evidence, access reviews, findings, incidents, audits, and people training records.',
  $body$<p>This internal runbook covers the Security &amp; Compliance (GRC) nav group. It is separate from the Operations <strong>Security Policy</strong> page at <code>/admin/security</code> (login anomalies and security events).</p>

<h2>Purpose</h2>
<p>Operate the ISO-style compliance hub: map controls, store evidence, track risks and findings, run access reviews, and prepare audit packs.</p>

<h2>Who uses this section</h2>
<p>Compliance leads, security team, and admins with <code>ADMIN_SECTION_SECURITY_COMPLIANCE</code> access.</p>

<h2>Pages in this section</h2>
<ul>
  <li><strong>Overview</strong> (<code>/admin/grc</code>) — programme health and module entry.</li>
  <li><strong>My work</strong> (<code>/admin/grc/my-work</code>) — assigned controls, findings, and tasks.</li>
  <li><strong>Setup wizard</strong> (<code>/admin/grc/setup</code>) — initial framework setup.</li>
  <li><strong>Controls</strong> (<code>/admin/grc/controls</code>) — control library and implementation status.</li>
  <li><strong>Statement of Applicability</strong> (<code>/admin/grc/soa</code>) — applicable controls and justifications.</li>
  <li><strong>Policies</strong> (<code>/admin/grc/documents</code>) — policy documents and acknowledgements.</li>
  <li><strong>Risks</strong> (<code>/admin/grc/risks</code>) — risk register and treatment.</li>
  <li><strong>Vendors &amp; assets</strong> (<code>/admin/grc/vendors</code>) — third parties and asset inventory.</li>
  <li><strong>Privacy</strong> (<code>/admin/grc/privacy</code>) — RoPA, DPIAs, data-subject requests.</li>
  <li><strong>Evidence locker</strong> (<code>/admin/grc/evidence</code>) — append-only evidence with fingerprints.</li>
  <li><strong>Access reviews</strong> (<code>/admin/grc/access-reviews</code>) — periodic access certification.</li>
  <li><strong>Findings</strong> (<code>/admin/grc/findings</code>) — audit and scan findings; corrective actions.</li>
  <li><strong>Incidents &amp; BC/DR</strong> (<code>/admin/grc/incidents</code>) — security incidents and BC/DR tests.</li>
  <li><strong>People &amp; training</strong> (<code>/admin/grc/people</code>) — training records and joiners/movers/leavers (compliance register).</li>
  <li><strong>Audits &amp; management review</strong> (<code>/admin/grc/audits</code>) — internal audits and management review.</li>
  <li><strong>Audit packs</strong> (<code>/admin/grc/audit-packs</code>) — exportable audit packages.</li>
  <li><strong>Settings</strong> (<code>/admin/grc/settings</code>) — GRC hub configuration.</li>
</ul>

<h2>Step-by-step tasks</h2>
<ol>
  <li><strong>Close a finding:</strong> Findings → open → attach retest evidence → mark resolved per policy.</li>
  <li><strong>Upload evidence:</strong> From a control or Evidence locker → upload → note SHA fingerprint is recorded.</li>
  <li><strong>Run access review:</strong> Access reviews → create cycle → certify or revoke access → complete review.</li>
  <li><strong>Record training completion:</strong> People &amp; training → Training tab (register); curriculum lives in Knowledge Base.</li>
</ol>

<h2>Common issues &amp; gotchas</h2>
<ul>
  <li>Critical/high findings require retest evidence before closure.</li>
  <li>Evidence locker items are append-only — upload a new version rather than deleting.</li>
  <li>Knowledge Base runbooks train staff; GRC People records prove completion for audits.</li>
</ul>

<h2>Escalation</h2>
<p>Active security incident → follow <a href="/admin/knowledge-base/incident-response-overview">Incident Response</a> and GRC Incidents module.</p>

<h2>Reference</h2>
<p>See also <a href="/admin/knowledge-base/users-trust-runbook">Users &amp; Trust Ops Runbook</a> and <a href="/admin/knowledge-base/platform-operations-runbook">Platform Operations Runbook</a> (<code>/admin/security</code> events).</p>$body$,
  'html', 'published', 'internal', TRUE, NOW()
FROM public.learning_categories c
WHERE c.slug = 'security-compliance-ops'
AND NOT EXISTS (
  SELECT 1 FROM public.learning_articles a
  WHERE a.slug = 'security-compliance-runbook' AND a.tenant_id IS NULL
);

-- Finance runbook: newer finance nav pages
UPDATE public.learning_articles
SET body = body || $append$
<h2>Extended finance pages</h2>
<ul>
  <li><strong>Payroll rule sets</strong> (<code>/admin/payroll-rules</code>) — publish and verify staff payroll rule sets (e.g. ZA tax year).</li>
  <li><strong>Trial Balance</strong> (<code>/admin/trial-balance</code>) — GL trial balance by period.</li>
  <li><strong>FX rates</strong> (<code>/admin/fx-rates</code>) — foreign exchange rate maintenance.</li>
  <li><strong>Reconciliation Exceptions</strong> (<code>/admin/reconciliation-exceptions</code>) <em>[Superadmin]</em> — ledger reconciliation exceptions.</li>
  <li><strong>Ledger Repair</strong> (<code>/admin/ledger-repair</code>) <em>[Superadmin]</em> — corrective ledger entries.</li>
  <li><strong>Ledger Health</strong> (<code>/admin/ledger-health</code>) <em>[Superadmin]</em> — ledger integrity checks.</li>
  <li><strong>Apple IAP</strong> (<code>/admin/monetization/apple/*</code>) <em>[Superadmin]</em> — setup sheet, products, transactions, notifications, settlements.</li>
</ul>
$append$,
    updated_at = NOW()
WHERE slug = 'finance-payouts-runbook' AND tenant_id IS NULL
  AND body NOT LIKE '%/admin/payroll-rules%';

-- Users & trust: Trust & Safety hub pages
UPDATE public.learning_articles
SET body = body || $append$
<h2>Trust &amp; Safety hub</h2>
<ul>
  <li><strong>Blocked Users</strong> (<code>/admin/user-blocks</code>) — view and manage blocks.</li>
  <li><strong>Content Reports</strong> (<code>/admin/content-reports</code>) — UGC moderation queue.</li>
  <li><strong>Fraud Cases</strong> (<code>/admin/fraud-cases</code>) — fraud investigation cases.</li>
  <li><strong>Identity &amp; Trust — Sessions</strong> (<code>/admin/identity-trust/sessions</code>) <em>[Superadmin]</em> — KYC session review.</li>
</ul>
$append$,
    updated_at = NOW()
WHERE slug = 'users-trust-runbook' AND tenant_id IS NULL
  AND body NOT LIKE '%/admin/fraud-cases%';

-- Marketing: market waitlist + brand desk link
UPDATE public.learning_articles
SET body = body || $append$
<h2>Market waitlist &amp; Brand desk</h2>
<ul>
  <li><strong>Market waitlist</strong> (<code>/admin/marketing/market-waitlist</code>) — city/market launch waitlist.</li>
  <li><strong>Brand desk</strong> — see <a href="/admin/knowledge-base/brand-desk-runbook">Brand Desk Runbook</a> (<code>/admin/brand</code>).</li>
</ul>
$append$,
    updated_at = NOW()
WHERE slug = 'marketing-comms-runbook' AND tenant_id IS NULL
  AND body NOT LIKE '%brand-desk-runbook%';

-- Integrations: additional superadmin integrations
UPDATE public.learning_articles
SET body = body || $append$
<h2>Additional integrations</h2>
<ul>
  <li><strong>Flutterwave</strong> (<code>/admin/integrations/flutterwave</code>) <em>[Superadmin]</em></li>
  <li><strong>Singular</strong> (<code>/admin/integrations/singular</code>) <em>[Superadmin]</em></li>
  <li><strong>Calls (Voice / Salestrail)</strong> (<code>/admin/integrations/calls</code>) <em>[Superadmin]</em></li>
  <li><strong>Apple App Store Connect</strong> (<code>/admin/integrations/apple</code>) <em>[Superadmin]</em></li>
  <li><strong>Courier shipping</strong> (<code>/admin/integrations/shipping</code>) <em>[Superadmin]</em></li>
</ul>
$append$,
    updated_at = NOW()
WHERE slug = 'integrations-dev-runbook' AND tenant_id IS NULL
  AND body NOT LIKE '%/admin/integrations/flutterwave%';

-- Platform operations: remove stale Monitoring reference, add cron/workflow/inbound
UPDATE public.learning_articles
SET body = replace(body,
  '<li><strong>Monitoring</strong> (<code>/admin/monitoring</code>) — error rates, latency, and queue depths; link to Datadog/Sentry dashboards.</li>', ''),
    updated_at = NOW()
WHERE slug = 'platform-operations-runbook' AND tenant_id IS NULL
  AND body LIKE '%/admin/monitoring%';

UPDATE public.learning_articles
SET body = replace(body,
  '<li><strong>Investigate a monitoring alert:</strong> Monitoring → find the spike in error rate or latency → filter by endpoint or service → drill into error details → cross-reference with System Health and Incident Response runbook.</li>',
  '<li><strong>Investigate a health alert:</strong> System Health → confirm component status → cross-reference Incident Response runbook.</li>'),
    updated_at = NOW()
WHERE slug = 'platform-operations-runbook' AND tenant_id IS NULL
  AND body LIKE '%Investigate a monitoring alert%';

UPDATE public.learning_articles
SET body = body || $append$
<h2>Platform automation (superadmin)</h2>
<ul>
  <li><strong>Cron runs</strong> (<code>/admin/cron-runs</code>) — scheduled job execution history.</li>
  <li><strong>Workflow runs</strong> (<code>/admin/workflow-runs</code>) — agent/workflow run audit.</li>
  <li><strong>Inbound webhooks</strong> (<code>/admin/webhooks/inbound</code>) — inbound webhook delivery log.</li>
</ul>
$append$,
    updated_at = NOW()
WHERE slug = 'platform-operations-runbook' AND tenant_id IS NULL
  AND body NOT LIKE '%/admin/cron-runs%';

-- Master overview: Brand desk + GRC
UPDATE public.learning_articles
SET body = body || $append$
<h2>Brand desk</h2>
<p>Briefs, campaign board, weekly metrics, pack export, and settings. See runbook: <a href="/admin/knowledge-base/brand-desk-runbook">Brand Desk Runbook</a>.</p>
<h2>Security &amp; Compliance (GRC)</h2>
<p>Controls, evidence, risks, findings, audits, and people training register. See runbook: <a href="/admin/knowledge-base/security-compliance-runbook">Security &amp; Compliance (GRC) Runbook</a>. Operations security events remain at <code>/admin/security</code> (Platform Operations runbook).</p>
$append$,
    updated_at = NOW()
WHERE slug = 'superadmin-operate-platform-overview' AND tenant_id IS NULL
  AND body NOT LIKE '%brand-desk-runbook%';

-- New training paths
INSERT INTO public.learning_training_paths (slug, title, role, description, sort_order, article_slugs)
SELECT
  'brand-desk-operator',
  'Brand Desk Operator',
  'brand_marketing',
  'Training for the brand desk: briefs, board, weekly update, pack, and settings.',
  8,
  ARRAY[
    'superadmin-operate-platform-overview',
    'brand-desk-runbook',
    'marketing-comms-runbook',
    'admin-overview-runbook'
  ]
WHERE NOT EXISTS (
  SELECT 1 FROM public.learning_training_paths p WHERE p.slug = 'brand-desk-operator'
);

INSERT INTO public.learning_training_paths (slug, title, role, description, sort_order, article_slugs)
SELECT
  'security-compliance-operator',
  'Security & Compliance Operator',
  'grc',
  'Training for the GRC hub and related trust and operations runbooks.',
  9,
  ARRAY[
    'superadmin-operate-platform-overview',
    'security-compliance-runbook',
    'users-trust-runbook',
    'incident-response-overview',
    'platform-operations-runbook'
  ]
WHERE NOT EXISTS (
  SELECT 1 FROM public.learning_training_paths p WHERE p.slug = 'security-compliance-operator'
);

UPDATE public.learning_training_paths
SET article_slugs = article_slugs || ARRAY['brand-desk-runbook'],
    updated_at = NOW()
WHERE slug = 'content-marketing-manager'
  AND NOT ('brand-desk-runbook' = ANY(article_slugs));

UPDATE public.learning_training_paths
SET article_slugs = article_slugs || ARRAY['brand-desk-runbook'],
    updated_at = NOW()
WHERE slug = 'superadmin-full-platform'
  AND NOT ('brand-desk-runbook' = ANY(article_slugs));

UPDATE public.learning_training_paths
SET article_slugs = article_slugs || ARRAY['security-compliance-runbook'],
    updated_at = NOW()
WHERE slug = 'trust-safety-reviewer'
  AND NOT ('security-compliance-runbook' = ANY(article_slugs));

UPDATE public.learning_training_paths
SET article_slugs = article_slugs || ARRAY['security-compliance-runbook'],
    updated_at = NOW()
WHERE slug = 'superadmin-full-platform'
  AND NOT ('security-compliance-runbook' = ANY(article_slugs));

UPDATE public.learning_training_paths SET checkpoint_quiz = '[
  {"id":"q1","prompt":"Where do you review brand briefs?","choices":["/admin/brand/briefs","/admin/promotions","/admin/ads"],"answer_index":0},
  {"id":"q2","prompt":"Campaign kanban board URL:","choices":["/admin/brand/board","/admin/brand/pack","/admin/marketing"],"answer_index":0},
  {"id":"q3","prompt":"Brand desk requires feature flag brand_desk.","choices":["True","False"],"answer_index":0}
]'::jsonb, updated_at = NOW()
WHERE slug = 'brand-desk-operator' AND checkpoint_quiz = '[]'::jsonb;

UPDATE public.learning_training_paths SET checkpoint_quiz = '[
  {"id":"q1","prompt":"GRC evidence locker is at:","choices":["/admin/grc/evidence","/admin/audit-logs","/admin/security"],"answer_index":0},
  {"id":"q2","prompt":"/admin/security is the same as the GRC hub.","choices":["True","False"],"answer_index":1},
  {"id":"q3","prompt":"People training compliance register:","choices":["/admin/grc/people","/admin/knowledge-base","/admin/content/learning"],"answer_index":0}
]'::jsonb, updated_at = NOW()
WHERE slug = 'security-compliance-operator' AND checkpoint_quiz = '[]'::jsonb;
