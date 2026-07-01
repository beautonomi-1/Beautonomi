-- 719_learning_center_internal_platform_training.sql
-- Full end-to-end internal training coverage for every admin nav group.
-- Adds internal categories (audience='internal', visibility='internal') aligned
-- to apps/admin-web/src/config/nav.ts groups, then authors one comprehensive
-- runbook per section following the standard LMS template:
--   Purpose / Who uses it / Pages in this section / Step-by-step tasks /
--   Managing & configuration / Common issues + gotchas /
--   Escalation / Reference for replies
-- Also adds a master overview article that maps the whole admin surface.
-- Idempotent: INSERT ... WHERE NOT EXISTS for categories and articles;
-- UPDATE ... WHERE slug for bodies (same pattern as 700/701).

-- ═══════════════════════════════════════════════════════════════════════════════
-- NEW INTERNAL CATEGORIES (per nav group not already covered)
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.learning_categories (title, slug, icon, sort_order, audience, visibility)
SELECT v.title, v.slug, v.icon, v.sort_order, v.audience, v.visibility
FROM (VALUES
  ('Admin Overview & Reporting',      'admin-overview-ops',       NULL, 46, 'internal', 'internal'),
  ('Support Desk Operations',         'support-desk-ops',         NULL, 47, 'internal', 'internal'),
  ('Provider Ops Hub',                'provider-ops-hub-ops',     NULL, 48, 'internal', 'internal'),
  ('Providers & Bookings Ops',        'providers-bookings-ops',   NULL, 49, 'internal', 'internal'),
  ('Finance & Payouts Ops',           'finance-payouts-ops',      NULL, 50, 'internal', 'internal'),
  ('Users & Trust Ops',               'users-trust-ops',          NULL, 51, 'internal', 'internal'),
  ('Content & Catalog Ops',           'content-catalog-ops',      NULL, 52, 'internal', 'internal'),
  ('E-commerce Ops',                  'ecommerce-ops',            NULL, 53, 'internal', 'internal'),
  ('Marketing & Comms Ops',           'marketing-comms-ops',      NULL, 54, 'internal', 'internal'),
  ('Integrations & Dev Ops',          'integrations-dev-ops',     NULL, 55, 'internal', 'internal'),
  ('Platform Operations',             'platform-operations-ops',  NULL, 56, 'internal', 'internal'),
  ('Platform Config & Superadmin',    'platform-config-ops',      NULL, 57, 'internal', 'internal')
) AS v(title, slug, icon, sort_order, audience, visibility)
WHERE NOT EXISTS (
  SELECT 1 FROM public.learning_categories c WHERE c.slug = v.slug
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- MASTER OVERVIEW ARTICLE
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.learning_articles
  (category_id, title, slug, summary, body, content_format, status, audience, is_internal, published_at)
SELECT c.id,
  'Operate the Platform End-to-End (Superadmin Master Guide)',
  'superadmin-operate-platform-overview',
  'Complete map of every admin section: who owns it, what it does, and where to find the detailed runbook.',
  $body$<p>This master guide gives every internal team member a single reference for what each admin section does and where to find its detailed operating runbook. Superadmin-only pages are marked <strong>[Superadmin]</strong>.</p>

<h2>Overview section</h2>
<p>Dashboard, Gods Eye [Superadmin], Analytics [Superadmin], Geo &amp; Devices [Superadmin], Reports, and the Knowledge Base itself. See runbook: <a href="/admin/knowledge-base/admin-overview-runbook">Admin Overview &amp; Reporting Runbook</a>.</p>

<h2>Support desk</h2>
<p>Support Tickets — triage, reply, insert article links, internal notes, escalation. See runbook: <a href="/admin/knowledge-base/support-desk-runbook">Support Desk Operations Runbook</a>.</p>

<h2>Provider Ops Hub</h2>
<p>Lead Inbox, Pipeline Board, Onboarding Tracker, Activation Queue, Duplicate Review, Reports, and Hub Settings. See runbook: <a href="/admin/knowledge-base/provider-ops-hub-runbook">Provider Ops Hub Runbook</a>.</p>

<h2>Providers &amp; Bookings operations</h2>
<p>Providers list, Provider distance settings, Staff, Bookings, Group bookings, Reviews &amp; ratings, Disputes, User Reports, and Refunds. See runbook: <a href="/admin/knowledge-base/providers-bookings-runbook">Providers &amp; Bookings Ops Runbook</a>.</p>

<h2>Finance</h2>
<p>Finance dashboard, Payouts, Fee Management, Platform Fees, Taxes, Period Locks, Plans &amp; pricing [Superadmin], Provider Subscriptions [Superadmin], Subscription Revenue [Superadmin], Wallet Reconciliation, Paystack Terminal, and Billing [Superadmin]. See runbook: <a href="/admin/knowledge-base/finance-payouts-runbook">Finance &amp; Payouts Ops Runbook</a>.</p>

<h2>Users &amp; Trust</h2>
<p>Users, Verifications, and Audit Logs. See runbook: <a href="/admin/knowledge-base/users-trust-runbook">Users &amp; Trust Ops Runbook</a>. Also see existing: <a href="/admin/knowledge-base/verification-ops-overview">Verification Operations</a>, <a href="/admin/knowledge-base/moderation-safety-ops-overview">Moderation &amp; Safety Ops</a>.</p>

<h2>Content &amp; Catalog</h2>
<p>Content CMS, Learning Center article authoring, CMS resources, FAQs, Catalog, Global categories, and Explore. See runbook: <a href="/admin/knowledge-base/content-catalog-runbook">Content &amp; Catalog Ops Runbook</a>.</p>

<h2>E-commerce</h2>
<p>E-commerce overview, Product Orders, Product Returns, Product Catalog, and Add-ons. See runbook: <a href="/admin/knowledge-base/ecommerce-runbook">E-commerce Ops Runbook</a>.</p>

<h2>Marketing &amp; Comms</h2>
<p>Ads &amp; Campaigns [Superadmin], Promotions, Loyalty, Point rules, Provider badges, Gamification ops, Gift Cards, Notifications, Broadcast, Marketing Automations, Notification Templates, WhatsApp Templates, Marketing pricebook, SMS Templates, Email Templates. See runbook: <a href="/admin/knowledge-base/marketing-comms-runbook">Marketing &amp; Comms Ops Runbook</a>.</p>

<h2>Integrations &amp; Dev</h2>
<p>Webhooks, API Keys, Integrations Hub [Superadmin], Sumsub [Superadmin], Gemini [Superadmin], Aura [Superadmin], Amplitude, Slack, Resend, Paystack, Yoco Web POS [Superadmin], Mapbox, OneSignal (push), WhatsApp Sessions/Templates, ISO Codes. See runbook: <a href="/admin/knowledge-base/integrations-dev-runbook">Integrations &amp; Dev Ops Runbook</a>.</p>

<h2>Operations</h2>
<p>Market Coverage (service zones), System Health, Monitoring, Security. See runbook: <a href="/admin/knowledge-base/platform-operations-runbook">Platform Operations Runbook</a>. Also see existing: <a href="/admin/knowledge-base/incident-response-overview">Incident Response</a>, <a href="/admin/knowledge-base/expansion-playbook-overview">Expansion Playbook</a>.</p>

<h2>Platform Config &amp; Superadmin</h2>
<p>Settings, Tenants [Superadmin], Tenant domains [Superadmin], Control Plane [Superadmin], Safety logs [Superadmin], Compliance purge [Superadmin], Tenant reset [Superadmin], Feature Flags, Custom Fields, App Version, Referral Settings, Referral sources, Team permissions [Superadmin], Admin team [Superadmin]. See runbook: <a href="/admin/knowledge-base/platform-config-runbook">Platform Config &amp; Superadmin Runbook</a>.</p>

<h2>Existing ops runbooks</h2>
<ul>
  <li><a href="/admin/knowledge-base/billing-ops-overview">Billing Operations</a></li>
  <li><a href="/admin/knowledge-base/disputes-refund-ops-overview">Disputes &amp; Refund Ops</a></li>
  <li><a href="/admin/knowledge-base/moderation-safety-ops-overview">Moderation &amp; Safety Ops</a></li>
  <li><a href="/admin/knowledge-base/verification-ops-overview">Verification Operations</a></li>
  <li><a href="/admin/knowledge-base/incident-response-overview">Incident Response</a></li>
  <li><a href="/admin/knowledge-base/expansion-playbook-overview">Expansion Playbook</a></li>
</ul>$body$,
  'html', 'published', 'internal', TRUE, NOW()
FROM public.learning_categories c
WHERE c.slug = 'admin-overview-ops'
AND NOT EXISTS (
  SELECT 1 FROM public.learning_articles a
  WHERE a.slug = 'superadmin-operate-platform-overview' AND a.tenant_id IS NULL
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. ADMIN OVERVIEW & REPORTING RUNBOOK
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.learning_articles
  (category_id, title, slug, summary, body, content_format, status, audience, is_internal, published_at)
SELECT c.id,
  'Admin Overview & Reporting Runbook',
  'admin-overview-runbook',
  'Internal runbook: the Overview section — Dashboard, Gods Eye, Analytics, Geo & Devices, Reports, and Knowledge Base.',
  $body$<p>This runbook covers the Overview nav group — the first set of pages any admin lands on. It is not visible to customers or providers.</p>

<h2>Purpose</h2>
<p>Give every internal user a top-level health view of the platform and the reporting tools to answer questions about bookings, revenue, and users without escalating.</p>

<h2>Who uses this section</h2>
<ul>
  <li><strong>All admin roles</strong> — Dashboard, Reports, Knowledge Base.</li>
  <li><strong>Superadmin only</strong> — Gods Eye, Analytics, Geo &amp; Devices.</li>
</ul>

<h2>Pages in this section</h2>
<ul>
  <li><strong>Dashboard</strong> (<code>/admin/dashboard</code>) — headline KPIs: bookings, GMV, active providers, new customers.</li>
  <li><strong>Gods Eye</strong> (<code>/admin/gods-eye</code>) <em>[Superadmin]</em> — live map of bookings and providers in real-time.</li>
  <li><strong>Analytics</strong> (<code>/admin/analytics</code>) <em>[Superadmin]</em> — cohort retention, funnel analysis, revenue breakdown.</li>
  <li><strong>Geo &amp; Devices</strong> (<code>/admin/analytics/geo</code>) <em>[Superadmin]</em> — geographic heat maps and device type split.</li>
  <li><strong>Reports</strong> (<code>/admin/reports</code>) — scheduled and on-demand CSV/PDF exports.</li>
  <li><strong>Knowledge Base</strong> (<code>/admin/knowledge-base</code>) — this training library.</li>
</ul>

<h2>Step-by-step tasks</h2>
<ol>
  <li><strong>Morning health check:</strong> open Dashboard → verify bookings in last 24 h are in expected range → check any red KPI cards.</li>
  <li><strong>Run a report:</strong> Reports → choose template (e.g. "Booking summary") → set date range → Export CSV or schedule weekly email.</li>
  <li><strong>Investigate a spike [Superadmin]:</strong> Analytics → select metric → drill into segment → cross-reference with Gods Eye for geographic pattern.</li>
  <li><strong>Share a metric:</strong> copy the report URL; recipients need the same admin role to view.</li>
</ol>

<h2>Common issues &amp; gotchas</h2>
<ul>
  <li>Dashboard KPIs are refreshed every 5 min — cache lag is expected during overnight batch jobs.</li>
  <li>Gods Eye requires superadmin; if colleagues see a permission error, check their role in Admin Team settings.</li>
  <li>Report exports above 50 k rows are queued; download link arrives by email within ~10 min.</li>
</ul>

<h2>Escalation</h2>
<p>If KPIs look incorrect or reports fail to generate, raise in the ops Slack channel and tag the platform team.</p>

<h2>Reference for replies</h2>
<p>No public article directly maps to this section. For general platform questions from providers or customers, link <a href="/learn/article/getting-started-overview">Welcome to Beautonomi</a>.</p>$body$,
  'html', 'published', 'internal', TRUE, NOW()
FROM public.learning_categories c
WHERE c.slug = 'admin-overview-ops'
AND NOT EXISTS (
  SELECT 1 FROM public.learning_articles a
  WHERE a.slug = 'admin-overview-runbook' AND a.tenant_id IS NULL
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. SUPPORT DESK OPERATIONS RUNBOOK
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.learning_articles
  (category_id, title, slug, summary, body, content_format, status, audience, is_internal, published_at)
SELECT c.id,
  'Support Desk Operations Runbook',
  'support-desk-runbook',
  'Internal runbook: managing support tickets end-to-end — triage, reply, article links, internal notes, escalation.',
  $body$<p>This internal runbook guides the support team through every step of managing support tickets in the admin SPA. It is not visible to customers or providers.</p>

<h2>Purpose</h2>
<p>Resolve customer and provider support requests quickly, consistently, and within SLA while maintaining clear records.</p>

<h2>Who uses this section</h2>
<p>All support agents and their team leads. Superadmin can also access.</p>

<h2>Pages in this section</h2>
<ul>
  <li><strong>Support Tickets</strong> (<code>/admin/support-tickets</code>) — the inbox: open, pending, resolved, and escalated tickets sorted by SLA deadline.</li>
  <li><strong>Ticket Detail</strong> (<code>/admin/support-tickets/:id</code>) — full thread, reply composer, internal note tab, article picker, user/booking context panel.</li>
</ul>

<h2>Step-by-step tasks</h2>
<ol>
  <li><strong>Triage the queue:</strong> open Support Tickets → sort by "Deadline" → assign yourself tickets in your tier that are unassigned.</li>
  <li><strong>Read context:</strong> open the ticket → review the user/booking context panel on the right — see linked booking, payment method, and prior tickets.</li>
  <li><strong>Reply to a customer:</strong> use the Reply tab → type your message → click <strong>Help articles</strong> to search the Knowledge Base and insert a relevant public article link → Send.</li>
  <li><strong>Leave an internal note:</strong> switch to the Internal Note tab → notes are never sent to the user; use for escalation context, decisions, or links to runbooks.</li>
  <li><strong>Escalate:</strong> change the ticket status to Escalated → tag the team lead in an internal note → follow up within your SLA window.</li>
  <li><strong>Resolve:</strong> once the issue is confirmed resolved, set status to Resolved. Do not close tickets until the user confirms or the SLA auto-close window passes.</li>
</ol>

<h2>Managing &amp; configuration</h2>
<ul>
  <li>Ticket categories and tags are configured in Platform Config → Settings.</li>
  <li>SLA tiers are set by ticket priority (Low/Normal/High/Urgent). High and Urgent automatically page the team lead via Slack.</li>
  <li>Auto-replies use Notification Templates (<code>/admin/notification-templates</code>).</li>
</ul>

<h2>Common issues &amp; gotchas</h2>
<ul>
  <li>Do not insert internal runbook links into customer-facing replies — the article picker disables Insert for <code>is_internal</code> articles automatically.</li>
  <li>Refund actions must be processed in the Finance &gt; Refunds page, not in the ticket itself — link the ticket in the refund notes.</li>
  <li>If a user has duplicate accounts, flag in an internal note and route to Trust (Users &amp; Trust section).</li>
</ul>

<h2>Escalation</h2>
<p>Legal or regulator contact → Compliance. Safety threats → Trust lead immediately. Payment failures unresolvable via refund page → Platform team.</p>

<h2>Reference for replies</h2>
<ul>
  <li>Cancellations: <a href="/learn/article/canceling-your-booking">Canceling your booking</a>, <a href="/learn/article/refunds-and-cancellation-fees">Refunds and cancellation fees</a>.</li>
  <li>Payments: <a href="/learn/article/payments-customer-overview">Payments overview</a>.</li>
  <li>Account: <a href="/learn/article/account-profile-overview">Account &amp; profile</a>.</li>
</ul>$body$,
  'html', 'published', 'internal', TRUE, NOW()
FROM public.learning_categories c
WHERE c.slug = 'support-desk-ops'
AND NOT EXISTS (
  SELECT 1 FROM public.learning_articles a
  WHERE a.slug = 'support-desk-runbook' AND a.tenant_id IS NULL
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. PROVIDER OPS HUB RUNBOOK
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.learning_articles
  (category_id, title, slug, summary, body, content_format, status, audience, is_internal, published_at)
SELECT c.id,
  'Provider Ops Hub Runbook',
  'provider-ops-hub-runbook',
  'Internal runbook: managing the full provider acquisition pipeline — leads, onboarding tracker, activation queue, duplicate review.',
  $body$<p>This internal runbook covers the Provider Ops Hub — the CRM-style workflow for acquiring, onboarding, and activating new providers. It is not visible to customers or providers.</p>

<h2>Purpose</h2>
<p>Move providers from initial interest through verification, onboarding, and first booking, with clear ownership and SLA at every stage.</p>

<h2>Who uses this section</h2>
<p>Provider ops specialists and their team leads.</p>

<h2>Pages in this section</h2>
<ul>
  <li><strong>Dashboard</strong> (<code>/admin/provider-ops</code>) — funnel KPIs: leads, in-progress, activated this week.</li>
  <li><strong>Lead Inbox</strong> (<code>/admin/provider-ops/leads</code>) — new inbound leads (signup form, referral, outbound) awaiting first contact.</li>
  <li><strong>Pipeline Board</strong> (<code>/admin/provider-ops/pipeline</code>) — kanban: New → Contacted → Documents sent → Under review → Approved → Activated.</li>
  <li><strong>Onboarding Tracker</strong> (<code>/admin/provider-ops/tracker</code>) — per-provider checklist: profile complete, services added, bank linked, first booking.</li>
  <li><strong>Activation Queue</strong> (<code>/admin/provider-ops/activation</code>) — providers who have passed verification but have not yet gone live.</li>
  <li><strong>Duplicate Review</strong> (<code>/admin/provider-ops/duplicates</code>) — flagged potential duplicate accounts for merge or dismissal.</li>
  <li><strong>Reports</strong> (<code>/admin/provider-ops/reports</code>) — pipeline velocity, time-to-activate, drop-off by stage.</li>
  <li><strong>Settings</strong> (<code>/admin/provider-ops/settings</code>) — stage labels, auto-assignment rules, Slack notifications.</li>
</ul>

<h2>Step-by-step tasks</h2>
<ol>
  <li><strong>Process a new lead:</strong> Lead Inbox → open → verify it is not a duplicate (check Duplicate Review) → assign to yourself → move to Pipeline "Contacted".</li>
  <li><strong>Advance the pipeline:</strong> Pipeline Board → drag card to next stage once the provider completes the stage requirement.</li>
  <li><strong>Track onboarding:</strong> Onboarding Tracker → open provider → tick completed checklist items → note blockers.</li>
  <li><strong>Activate a provider:</strong> Activation Queue → confirm verification status is Approved (cross-check Verifications in Users &amp; Trust) → click Activate → provider is now live.</li>
  <li><strong>Resolve a duplicate:</strong> Duplicate Review → compare the two accounts → if confirmed duplicate: merge (preserves bookings and reviews on the primary account) or dismiss flag.</li>
</ol>

<h2>Managing &amp; configuration</h2>
<ul>
  <li>Pipeline stages and their entry criteria are configured in Hub Settings.</li>
  <li>Auto-assignment rules route leads by region or service category.</li>
  <li>Slack integration sends a notification when a provider reaches Activation Queue (configure in Settings).</li>
</ul>

<h2>Common issues &amp; gotchas</h2>
<ul>
  <li>Duplicate Review only flags accounts with the same phone or email — visually similar business names require manual cross-check.</li>
  <li>Activation is irreversible from the queue — verify the verification status is "Approved" in Users &amp; Trust first.</li>
  <li>A provider in "Documents sent" stage more than 7 days auto-escalates a Slack reminder; do not manually advance until docs arrive.</li>
</ul>

<h2>Escalation</h2>
<p>Suspected fraudulent provider → Trust team immediately. Verification disputes → Verification Ops runbook.</p>

<h2>Reference for replies</h2>
<ul>
  <li><a href="/learn/article/provider-onboarding-overview">Provider Onboarding</a></li>
  <li><a href="/learn/article/verification-steps">Verification steps</a></li>
  <li><a href="/learn/article/setup-status-checklist">Setup status checklist</a></li>
</ul>$body$,
  'html', 'published', 'internal', TRUE, NOW()
FROM public.learning_categories c
WHERE c.slug = 'provider-ops-hub-ops'
AND NOT EXISTS (
  SELECT 1 FROM public.learning_articles a
  WHERE a.slug = 'provider-ops-hub-runbook' AND a.tenant_id IS NULL
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. PROVIDERS & BOOKINGS OPS RUNBOOK
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.learning_articles
  (category_id, title, slug, summary, body, content_format, status, audience, is_internal, published_at)
SELECT c.id,
  'Providers & Bookings Ops Runbook',
  'providers-bookings-runbook',
  'Internal runbook: managing providers, staff, bookings, group bookings, reviews, disputes, user reports, and refunds.',
  $body$<p>This internal runbook covers the Providers &amp; operations nav group. It is not visible to customers or providers.</p>

<h2>Purpose</h2>
<p>Directly manage provider accounts and bookings: edit profiles, resolve booking issues, action disputes and user reports, process refunds.</p>

<h2>Who uses this section</h2>
<p>Support agents (bookings, disputes, refunds), operations team (provider profile management), team leads.</p>

<h2>Pages in this section</h2>
<ul>
  <li><strong>Providers</strong> (<code>/admin/providers</code>) — searchable provider list; open a provider record to edit profile, services, staff, and settings.</li>
  <li><strong>Provider distance</strong> (<code>/admin/providers/distance-settings</code>) — global and per-provider travel radius and fee configuration.</li>
  <li><strong>Staff</strong> (<code>/admin/staff</code>) — view and manage staff members across all providers; link staff to providers.</li>
  <li><strong>Bookings</strong> (<code>/admin/bookings</code>) — all bookings across the platform with filters by status, date, provider, customer, and payment method.</li>
  <li><strong>Group bookings</strong> (<code>/admin/group-bookings</code>) — multi-participant session bookings.</li>
  <li><strong>Reviews &amp; ratings</strong> (<code>/admin/reviews</code>) — all customer reviews; moderate, hide, or remove.</li>
  <li><strong>Disputes</strong> (<code>/admin/disputes</code>) — raised disputes between customers and providers; decision workflow.</li>
  <li><strong>User Reports</strong> (<code>/admin/user-reports</code>) — flagged content and safety reports from customers and providers.</li>
  <li><strong>Refunds</strong> (<code>/admin/refunds</code>) — initiate and track refunds against Paystack payments.</li>
</ul>

<h2>Step-by-step tasks</h2>
<ol>
  <li><strong>Edit a provider profile:</strong> Providers → search → open record → edit fields (name, description, location, services) → Save.</li>
  <li><strong>Look up a booking:</strong> Bookings → filter by customer email or booking ID → open → review payment, status, and timeline.</li>
  <li><strong>Process a refund:</strong> Bookings → open booking → verify it was paid via Paystack (in-person Yoco/cash cannot be refunded via platform) → go to Refunds → create refund referencing the booking ID → amount returns to original payment method.</li>
  <li><strong>Resolve a dispute:</strong> Disputes → open → review evidence from both parties → apply cancellation/refund policy → record decision → mark resolved. See also <a href="/admin/knowledge-base/disputes-refund-ops-overview">Disputes &amp; Refund Ops</a> runbook.</li>
  <li><strong>Moderate a review:</strong> Reviews &amp; ratings → find review → Hide (keeps in DB for audit) or Remove with reason code.</li>
  <li><strong>Action a user report:</strong> User Reports → open → review content → act (hide, suspend, escalate to Trust) → record rationale.</li>
</ol>

<h2>Managing &amp; configuration</h2>
<ul>
  <li>Provider distance settings affect travel fee calculations platform-wide — only change per guidance from the ops lead.</li>
  <li>Staff are shared resources; linking a staff member to multiple providers is allowed but their calendar must not double-book.</li>
  <li>Refunds are processed via Paystack API — confirm fund availability before initiating large refunds.</li>
</ul>

<h2>Common issues &amp; gotchas</h2>
<ul>
  <li>Cancellation fees reduce the refundable amount — always check the booking's cancellation policy before promising a full refund.</li>
  <li>Group bookings require all participants to be refunded individually if the booking is cancelled.</li>
  <li>Hiding a review does not notify the reviewer — use with a support note to the provider explaining the action.</li>
</ul>

<h2>Escalation</h2>
<p>Suspected fraud on a booking → Finance and Trust. Safety threat from a user report → Trust lead immediately (see <a href="/admin/knowledge-base/moderation-safety-ops-overview">Moderation &amp; Safety Ops</a>).</p>

<h2>Reference for replies</h2>
<ul>
  <li><a href="/learn/article/canceling-your-booking">Canceling your booking</a></li>
  <li><a href="/learn/article/refunds-and-cancellation-fees">Refunds and cancellation fees</a></li>
  <li><a href="/learn/article/if-provider-cancels">If your provider cancels</a></li>
  <li><a href="/learn/article/reviews-ratings-overview">Reviews &amp; ratings</a></li>
</ul>$body$,
  'html', 'published', 'internal', TRUE, NOW()
FROM public.learning_categories c
WHERE c.slug = 'providers-bookings-ops'
AND NOT EXISTS (
  SELECT 1 FROM public.learning_articles a
  WHERE a.slug = 'providers-bookings-runbook' AND a.tenant_id IS NULL
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. FINANCE & PAYOUTS OPS RUNBOOK
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.learning_articles
  (category_id, title, slug, summary, body, content_format, status, audience, is_internal, published_at)
SELECT c.id,
  'Finance & Payouts Ops Runbook',
  'finance-payouts-runbook',
  'Internal runbook: finance dashboard, payouts, fee management, taxes, period locks, plans, subscriptions, wallet reconciliation, and Paystack Terminal.',
  $body$<p>This internal runbook covers the Finance nav group. It is not visible to customers or providers. See also the existing <a href="/admin/knowledge-base/billing-ops-overview">Billing Operations</a> runbook.</p>

<h2>Purpose</h2>
<p>Maintain accurate financial operations: approve payouts, manage platform fees, reconcile the wallet ledger, and support providers with billing questions.</p>

<h2>Who uses this section</h2>
<ul>
  <li><strong>Finance team</strong> — Finance dashboard, Payouts, Fee Management, Taxes, Period Locks, Wallet Reconciliation, Paystack Terminal.</li>
  <li><strong>Superadmin only</strong> — Plans &amp; pricing, Provider Subscriptions, Subscription Revenue, Billing.</li>
</ul>

<h2>Pages in this section</h2>
<ul>
  <li><strong>Finance</strong> (<code>/admin/finance</code>) — GMV, platform revenue, refunds, and earnings summary by period.</li>
  <li><strong>Payouts</strong> (<code>/admin/payouts</code>) — pending and processed provider payout requests; approve or hold.</li>
  <li><strong>Fee Management</strong> (<code>/admin/fees</code>) — per-booking and per-service fee overrides.</li>
  <li><strong>Platform Fees</strong> (<code>/admin/settings/platform-fees</code>) — global fee rates by booking/order type and region.</li>
  <li><strong>Taxes</strong> (<code>/admin/taxes</code>) — tax rate configuration by region.</li>
  <li><strong>Period Locks</strong> (<code>/admin/period-locks</code>) — lock historical accounting periods to prevent retroactive edits.</li>
  <li><strong>Plans &amp; pricing</strong> (<code>/admin/plans</code>) <em>[Superadmin]</em> — provider subscription plan definitions (Paystack plan codes).</li>
  <li><strong>Provider Subscriptions</strong> (<code>/admin/provider-subscriptions</code>) <em>[Superadmin]</em> — view and manage individual provider subscription records.</li>
  <li><strong>Subscription Revenue</strong> (<code>/admin/subscription-revenue</code>) <em>[Superadmin]</em> — MRR/ARR and churn analytics.</li>
  <li><strong>Wallet Reconciliation</strong> (<code>/admin/wallet-reconciliation</code>) — match platform wallet ledger against Paystack settlement records.</li>
  <li><strong>Paystack Terminal</strong> (<code>/admin/paystack-terminal</code>) — physical terminal allocations and transaction logs.</li>
  <li><strong>Billing</strong> (<code>/admin/billing</code>) <em>[Superadmin]</em> — platform billing to tenants.</li>
</ul>

<h2>Step-by-step tasks</h2>
<ol>
  <li><strong>Approve a payout:</strong> Payouts → filter by "Pending" → verify the provider has a linked bank account and sufficient net earnings (gross minus refunds and platform fees) → Approve → payout is queued to Paystack.</li>
  <li><strong>Configure a fee override:</strong> Fee Management → find the provider or service → set override rate → Save. Platform Fees sets the global default.</li>
  <li><strong>Lock a period:</strong> Period Locks → enter month/year → Lock. No finance records can be edited for that period after locking.</li>
  <li><strong>Reconcile the wallet:</strong> Wallet Reconciliation → select period → run reconciliation → review any discrepancy rows → resolve or escalate.</li>
  <li><strong>Manage a provider subscription [Superadmin]:</strong> Provider Subscriptions → find provider → view plan, renewal date, and payment status → Cancel or change plan if requested by provider with a valid reason.</li>
</ol>

<h2>Common issues &amp; gotchas</h2>
<ul>
  <li>Only Paystack-held (online card) payments contribute to the withdrawable payout balance — in-person Yoco/cash does not flow through the platform ledger.</li>
  <li>Refunds reduce net earnings; a provider's withdrawable balance can go negative if a refund exceeds their current balance — hold the payout until resolved.</li>
  <li>Period locks are permanent — confirm with the finance lead before locking.</li>
  <li>Provider subscription plan codes in Plans &amp; pricing must match Paystack exactly; a mismatch causes payment failures on renewal.</li>
</ul>

<h2>Escalation</h2>
<p>Payout failures or Paystack API errors → Platform team. Tax configuration changes → Finance lead approval required. See also <a href="/admin/knowledge-base/billing-ops-overview">Billing Operations</a>.</p>

<h2>Reference for replies</h2>
<ul>
  <li><a href="/learn/article/pricing-subscriptions-overview">Pricing &amp; Subscriptions</a></li>
  <li><a href="/learn/article/understanding-earnings">Understanding your earnings</a></li>
  <li><a href="/learn/article/request-payout">How to request a payout</a></li>
  <li><a href="/learn/article/payments-customer-overview">Payments overview</a></li>
</ul>$body$,
  'html', 'published', 'internal', TRUE, NOW()
FROM public.learning_categories c
WHERE c.slug = 'finance-payouts-ops'
AND NOT EXISTS (
  SELECT 1 FROM public.learning_articles a
  WHERE a.slug = 'finance-payouts-runbook' AND a.tenant_id IS NULL
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. USERS & TRUST OPS RUNBOOK
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.learning_articles
  (category_id, title, slug, summary, body, content_format, status, audience, is_internal, published_at)
SELECT c.id,
  'Users & Trust Ops Runbook',
  'users-trust-runbook',
  'Internal runbook: managing users, verifications, and audit logs — identity, account actions, trust decisions.',
  $body$<p>This internal runbook covers the Users &amp; trust nav group. It is not visible to customers or providers. See also <a href="/admin/knowledge-base/verification-ops-overview">Verification Operations</a> and <a href="/admin/knowledge-base/moderation-safety-ops-overview">Moderation &amp; Safety Ops</a>.</p>

<h2>Purpose</h2>
<p>Manage user accounts with care: verify identities, suspend or ban when necessary, and maintain an auditable record of every platform action.</p>

<h2>Who uses this section</h2>
<p>Trust &amp; safety team, verification reviewers, compliance leads, and superadmin.</p>

<h2>Pages in this section</h2>
<ul>
  <li><strong>Users</strong> (<code>/admin/users</code>) — full user list (customers and providers); search by email/phone/name; open a user record for account details, booking history, and account actions.</li>
  <li><strong>Verifications</strong> (<code>/admin/verifications</code>) — queue of provider identity and business verification submissions.</li>
  <li><strong>Audit Logs</strong> (<code>/admin/audit-logs</code>) — immutable log of every admin action against any record.</li>
</ul>

<h2>Step-by-step tasks</h2>
<ol>
  <li><strong>Look up a user:</strong> Users → search by email or phone → open → review profile completeness, linked accounts, and booking history.</li>
  <li><strong>Suspend an account:</strong> Users → open user → Account Actions → Suspend → enter reason (stored in Audit Logs) → user is immediately locked out and notified.</li>
  <li><strong>Ban an account:</strong> Account Actions → Ban → requires trust lead approval (second approver). Bans are permanent unless reversed by a superadmin.</li>
  <li><strong>Process a verification:</strong> Verifications → open submission → follow the <a href="/admin/knowledge-base/verification-ops-overview">Verification Operations</a> runbook. Approve, request more info, or decline.</li>
  <li><strong>Audit an action:</strong> Audit Logs → filter by user ID, admin user, or action type → review what was changed and by whom.</li>
</ol>

<h2>Managing &amp; configuration</h2>
<ul>
  <li>Verification document review uses Sumsub integration — check Integrations &gt; Sumsub if the queue shows a loading error.</li>
  <li>Audit Logs are append-only; no admin can delete log entries.</li>
</ul>

<h2>Common issues &amp; gotchas</h2>
<ul>
  <li>A suspended provider's future bookings are not automatically cancelled — check their Bookings and notify customers manually via support ticket.</li>
  <li>Do not share verification documents outside the team; handle under data-privacy policy.</li>
  <li>Duplicate accounts should be routed to Provider Ops Hub → Duplicate Review rather than manually merged here.</li>
</ul>

<h2>Escalation</h2>
<p>Confirmed fraud or legal threat → Compliance immediately. Identity document that looks forged → Trust lead before any action.</p>

<h2>Reference for replies</h2>
<ul>
  <li><a href="/learn/article/account-profile-overview">Account &amp; profile</a></li>
  <li><a href="/learn/article/verification-steps">Verification steps</a></li>
</ul>$body$,
  'html', 'published', 'internal', TRUE, NOW()
FROM public.learning_categories c
WHERE c.slug = 'users-trust-ops'
AND NOT EXISTS (
  SELECT 1 FROM public.learning_articles a
  WHERE a.slug = 'users-trust-runbook' AND a.tenant_id IS NULL
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 7. CONTENT & CATALOG OPS RUNBOOK
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.learning_articles
  (category_id, title, slug, summary, body, content_format, status, audience, is_internal, published_at)
SELECT c.id,
  'Content & Catalog Ops Runbook',
  'content-catalog-runbook',
  'Internal runbook: CMS content, Learning Center authoring, FAQs, catalog management, and Explore curation.',
  $body$<p>This internal runbook covers the Content &amp; catalog nav group. It is not visible to customers or providers.</p>

<h2>Purpose</h2>
<p>Keep the public-facing content and service catalog accurate and well-organised: publish articles, manage FAQs, curate the service catalog, and maintain the Explore discovery grid.</p>

<h2>Who uses this section</h2>
<p>Content editors, catalog managers, and marketing team.</p>

<h2>Pages in this section</h2>
<ul>
  <li><strong>Content</strong> (<code>/admin/content</code>) — CMS hub for static pages and resource articles.</li>
  <li><strong>Learning Center</strong> (<code>/admin/content/learning</code>) — article editor for public (<code>/learn</code>) and internal articles.</li>
  <li><strong>CMS resources</strong> (<code>/admin/content/resources</code>) — images, downloadable files, and linked assets used in articles.</li>
  <li><strong>FAQs</strong> (<code>/admin/content/faqs</code>) — question/answer pairs displayed on the public site and in-app help.</li>
  <li><strong>Catalog</strong> (<code>/admin/catalog</code>) — service category taxonomy used by providers when listing services.</li>
  <li><strong>Global categories</strong> (<code>/admin/catalog/global-categories</code>) — top-level categories visible platform-wide.</li>
  <li><strong>Explore</strong> (<code>/admin/explore</code>) — curate the discovery grid: featured images, collections, and ordering.</li>
</ul>

<h2>Step-by-step tasks</h2>
<ol>
  <li><strong>Author a Learning Center article:</strong> Learning Center → New article → choose audience (General/Customer/Provider/Internal) → write HTML body in the visual editor → add mockup placeholders via the Mockup button if needed → set status to Published → Save. See <a href="/admin/knowledge-base/learning-center-authoring-guide">Learning Center Authoring Guide</a>.</li>
  <li><strong>Update an FAQ:</strong> FAQs → find or create entry → edit question and answer → set category → Publish.</li>
  <li><strong>Add a catalog category:</strong> Catalog → New category → set name, slug, parent, icon → Save → providers can now select it for their services.</li>
  <li><strong>Update the Explore grid:</strong> Explore → drag to reorder featured collections → upload hero image → set active status.</li>
  <li><strong>Mark an internal article:</strong> Learning Center → open article → toggle "Internal" (only visible in admin KB) → Save.</li>
</ol>

<h2>Managing &amp; configuration</h2>
<ul>
  <li>Learning articles with <code>is_internal = true</code> never appear on the public <code>/learn</code> site — they are only accessible in the admin Knowledge Base.</li>
  <li>Catalog changes are reflected in provider service-creation flows within minutes (no deploy required).</li>
  <li>Explore images should be 1200×800 px minimum for crisp rendering on mobile and web.</li>
</ul>

<h2>Common issues &amp; gotchas</h2>
<ul>
  <li>Do not paste raw <code>data-learn-mockup</code> HTML directly into the TipTap editor — use the Mockup button to prevent node stripping.</li>
  <li>Deleting a catalog category that providers are using for their services will orphan those services — archive instead of delete.</li>
  <li>FAQ entries without a category are not displayed on the public FAQ page.</li>
</ul>

<h2>Escalation</h2>
<p>Incorrect pricing or policy information published live → content lead immediately for same-day correction.</p>

<h2>Reference for replies</h2>
<p>When providers ask about managing their own service listings: <a href="/learn/article/services-catalogue-overview">Services catalogue</a>.</p>$body$,
  'html', 'published', 'internal', TRUE, NOW()
FROM public.learning_categories c
WHERE c.slug = 'content-catalog-ops'
AND NOT EXISTS (
  SELECT 1 FROM public.learning_articles a
  WHERE a.slug = 'content-catalog-runbook' AND a.tenant_id IS NULL
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 8. E-COMMERCE OPS RUNBOOK
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.learning_articles
  (category_id, title, slug, summary, body, content_format, status, audience, is_internal, published_at)
SELECT c.id,
  'E-commerce Ops Runbook',
  'ecommerce-runbook',
  'Internal runbook: managing product orders, returns, product catalog, and service add-ons.',
  $body$<p>This internal runbook covers the E-commerce nav group. It is not visible to customers or providers.</p>

<h2>Purpose</h2>
<p>Support product commerce operations: manage orders and returns, maintain the product catalog, and configure booking add-ons.</p>

<h2>Who uses this section</h2>
<p>E-commerce ops team, support agents handling product order queries.</p>

<h2>Pages in this section</h2>
<ul>
  <li><strong>Overview</strong> (<code>/admin/ecommerce</code>) — product orders GMV, fulfilment rate, and return rate by period.</li>
  <li><strong>Product Orders</strong> (<code>/admin/ecommerce/orders</code>) — all product orders: pending, fulfilled, and returned. Search by customer, product, or order ID.</li>
  <li><strong>Product Returns</strong> (<code>/admin/ecommerce/returns</code>) — return requests; approve, reject, or request more information.</li>
  <li><strong>Product Catalog</strong> (<code>/admin/ecommerce/products</code>) — global product listings; edit, archive, or create platform-level products (provider products are managed by providers themselves).</li>
  <li><strong>Add-ons</strong> (<code>/admin/addons</code>) — service add-ons attachable to bookings at checkout (e.g. product bundles, extras).</li>
</ul>

<h2>Step-by-step tasks</h2>
<ol>
  <li><strong>Look up an order:</strong> Product Orders → search by order ID or customer email → open → review fulfilment status, payment, and shipping details.</li>
  <li><strong>Process a return:</strong> Product Returns → open request → verify the return policy for the product → Approve (triggers refund to original payment method) or Reject with reason.</li>
  <li><strong>Archive a product:</strong> Product Catalog → open product → set status to Archived → it disappears from the storefront without deleting historical orders.</li>
  <li><strong>Create an add-on:</strong> Add-ons → New add-on → set name, price, applicable service categories → Publish.</li>
</ol>

<h2>Common issues &amp; gotchas</h2>
<ul>
  <li>Product orders placed alongside a booking are linked — cancelling the booking does not automatically cancel the product order. Handle both separately.</li>
  <li>Return approvals for items above the auto-approve threshold require manager sign-off before processing.</li>
  <li>Add-ons set at the platform level appear for all providers in the applicable category — changes affect all providers immediately.</li>
</ul>

<h2>Escalation</h2>
<p>High-value return disputes → e-commerce lead. Product catalog errors visible to customers → content lead for immediate correction.</p>

<h2>Reference for replies</h2>
<p>For customers asking about payments and receipts on product orders: <a href="/learn/article/payments-customer-overview">Payments overview</a>.</p>$body$,
  'html', 'published', 'internal', TRUE, NOW()
FROM public.learning_categories c
WHERE c.slug = 'ecommerce-ops'
AND NOT EXISTS (
  SELECT 1 FROM public.learning_articles a
  WHERE a.slug = 'ecommerce-runbook' AND a.tenant_id IS NULL
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 9. MARKETING & COMMS OPS RUNBOOK
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.learning_articles
  (category_id, title, slug, summary, body, content_format, status, audience, is_internal, published_at)
SELECT c.id,
  'Marketing & Comms Ops Runbook',
  'marketing-comms-runbook',
  'Internal runbook: promotions, loyalty, gift cards, notifications, broadcast, automations, and all message templates.',
  $body$<p>This internal runbook covers the Marketing &amp; comms nav group. It is not visible to customers or providers.</p>

<h2>Purpose</h2>
<p>Drive customer and provider engagement: create promotions and loyalty campaigns, manage gift cards, configure notification templates, and run broadcast and automation workflows.</p>

<h2>Who uses this section</h2>
<ul>
  <li><strong>Marketing team</strong> — Promotions, Loyalty, Point rules, Provider badges, Gift Cards, Broadcast, Marketing Automations, Marketing pricebook.</li>
  <li><strong>Comms/tech team</strong> — Notification Templates, WhatsApp Templates, SMS Templates, Email Templates, Notification settings.</li>
  <li><strong>Superadmin only</strong> — Ads &amp; Campaigns.</li>
</ul>

<h2>Pages in this section</h2>
<ul>
  <li><strong>Ads &amp; Campaigns</strong> (<code>/admin/ads</code>) <em>[Superadmin]</em> — paid ad campaigns and attribution tracking.</li>
  <li><strong>Promotions</strong> (<code>/admin/promotions</code>) — discount codes, percentage-off and flat-amount offers, expiry, and usage limits.</li>
  <li><strong>Loyalty</strong> (<code>/admin/loyalty</code>) — customer loyalty programme configuration.</li>
  <li><strong>Point rules</strong> (<code>/admin/gamification/point-rules</code>) — rules for earning loyalty points on bookings and actions.</li>
  <li><strong>Provider badges</strong> (<code>/admin/gamification/badges</code>) — achievement badges awarded to providers.</li>
  <li><strong>Gamification ops</strong> (<code>/admin/gamification/operations</code>) — manually award or revoke points and badges; audit trail.</li>
  <li><strong>Gift Cards</strong> (<code>/admin/gift-cards</code>) — create and manage gift card products; view redemption history.</li>
  <li><strong>Notifications</strong> (<code>/admin/notifications</code>) — push/in-app notification settings and OneSignal configuration.</li>
  <li><strong>Broadcast</strong> (<code>/admin/broadcast</code>) — send a one-time message to a segment of users or all users.</li>
  <li><strong>Marketing Automations</strong> (<code>/admin/automations</code>) — event-triggered drip campaigns (booking completed → review request, etc.).</li>
  <li><strong>Notification Templates</strong> (<code>/admin/notification-templates</code>) — in-app and push message copy templates.</li>
  <li><strong>WhatsApp Templates</strong> (<code>/admin/whatsapp-content-templates</code>) — approved WhatsApp Business message templates.</li>
  <li><strong>Marketing pricebook</strong> (<code>/admin/marketing-pricebook</code>) — SMS and email cost configuration per campaign type.</li>
  <li><strong>SMS Templates</strong> (<code>/admin/sms-templates</code>) — SMS body copy templates.</li>
  <li><strong>Email Templates</strong> (<code>/admin/email-templates</code>) — transactional and marketing email templates (Resend integration).</li>
</ul>

<h2>Step-by-step tasks</h2>
<ol>
  <li><strong>Create a promotion:</strong> Promotions → New → set code, discount type and value, start/end date, usage limit and per-user cap → Publish.</li>
  <li><strong>Launch a broadcast:</strong> Broadcast → New → select segment (All customers / All providers / custom filter) → compose message → Preview → Schedule or Send now. Always preview before sending.</li>
  <li><strong>Update a notification template:</strong> Notification Templates → find template → edit copy variables → Save. Changes apply to the next triggered notification.</li>
  <li><strong>Add a WhatsApp template:</strong> WhatsApp Templates → Submit new → write copy respecting Meta's template guidelines → Submit for Meta approval (approval takes 24–48 h). Only approved templates can be sent.</li>
  <li><strong>Award a badge manually:</strong> Gamification ops → find provider → Award badge → select badge → add reason note.</li>
</ol>

<h2>Common issues &amp; gotchas</h2>
<ul>
  <li>Broadcast sends are irreversible — always preview the recipient count before sending. Accidental mass sends require a follow-up correction broadcast.</li>
  <li>WhatsApp templates must be re-approved by Meta after any copy changes — do not edit live templates; create a new version.</li>
  <li>Promotion codes are case-insensitive on the customer side; avoid codes that are easily confused (0/O, 1/l).</li>
  <li>Gift card values are stored in the wallet — any gift card issued cannot be deleted, only deactivated.</li>
</ul>

<h2>Escalation</h2>
<p>Incorrect broadcast sent → marketing lead to draft correction immediately. WhatsApp template rejection by Meta → comms team to revise.</p>

<h2>Reference for replies</h2>
<ul>
  <li><a href="/learn/article/loyalty-rewards-overview">Loyalty &amp; rewards</a></li>
  <li><a href="/learn/article/wallet-gift-cards-coupons-overview">Wallet, gift cards &amp; coupons</a></li>
</ul>$body$,
  'html', 'published', 'internal', TRUE, NOW()
FROM public.learning_categories c
WHERE c.slug = 'marketing-comms-ops'
AND NOT EXISTS (
  SELECT 1 FROM public.learning_articles a
  WHERE a.slug = 'marketing-comms-runbook' AND a.tenant_id IS NULL
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 10. INTEGRATIONS & DEV OPS RUNBOOK
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.learning_articles
  (category_id, title, slug, summary, body, content_format, status, audience, is_internal, published_at)
SELECT c.id,
  'Integrations & Dev Ops Runbook',
  'integrations-dev-runbook',
  'Internal runbook: webhooks, API keys, Sumsub, Gemini, Aura, Amplitude, Slack, Resend, Paystack, Yoco, Mapbox, OneSignal, WhatsApp, and ISO codes.',
  $body$<p>This internal runbook covers the Integrations &amp; dev nav group. It is not visible to customers or providers.</p>

<h2>Purpose</h2>
<p>Configure and maintain every third-party integration and developer-facing API surface that keeps the platform operating.</p>

<h2>Who uses this section</h2>
<ul>
  <li><strong>Platform/tech team</strong> — all pages.</li>
  <li><strong>Superadmin only</strong> — Integrations Hub, Sumsub, Gemini, Aura, Yoco Web POS.</li>
</ul>

<h2>Pages in this section</h2>
<ul>
  <li><strong>Webhooks</strong> (<code>/admin/webhooks</code>) — configure and test outgoing webhook endpoints for booking/payment events.</li>
  <li><strong>API Keys</strong> (<code>/admin/api-keys</code>) — manage platform API keys for partner integrations.</li>
  <li><strong>Integrations Hub</strong> (<code>/admin/control-plane/integrations</code>) <em>[Superadmin]</em> — master toggle and config for all third-party services.</li>
  <li><strong>Sumsub</strong> (<code>/admin/control-plane/integrations/sumsub</code>) <em>[Superadmin]</em> — identity verification configuration (webhook secret, flow IDs).</li>
  <li><strong>Gemini</strong> (<code>/admin/control-plane/integrations/gemini</code>) <em>[Superadmin]</em> — AI/ML integration settings.</li>
  <li><strong>Aura</strong> (<code>/admin/control-plane/integrations/aura</code>) <em>[Superadmin]</em> — real-time analytics pipeline.</li>
  <li><strong>Amplitude</strong> (<code>/admin/integrations/amplitude</code>) — product analytics API key and event routing.</li>
  <li><strong>Slack</strong> (<code>/admin/integrations/slack</code>) — Slack webhook URLs for platform alert channels.</li>
  <li><strong>Resend</strong> (<code>/admin/integrations/resend</code>) — transactional email configuration (API key, sender domain).</li>
  <li><strong>Paystack</strong> (<code>/admin/integrations/paystack</code>) — Paystack public/secret keys, webhook secret, and split-payment sub-account config.</li>
  <li><strong>Yoco Web POS</strong> (<code>/admin/integrations/yoco</code>) <em>[Superadmin]</em> — Yoco API key and POS terminal registration.</li>
  <li><strong>Mapbox</strong> (<code>/admin/mapbox</code>) — Mapbox access token and style URL for maps and routing.</li>
  <li><strong>OneSignal (push)</strong> (<code>/admin/notifications</code>) — push notification app IDs and API keys.</li>
  <li><strong>WhatsApp Sessions/Templates</strong> (<code>/admin/whatsapp/sessions</code>, <code>/admin/whatsapp/templates</code>) — WhatsApp Business API session management.</li>
  <li><strong>ISO Codes</strong> (<code>/admin/iso-codes</code>) — supported country and currency codes for multi-region deployments.</li>
</ul>

<h2>Step-by-step tasks</h2>
<ol>
  <li><strong>Add a webhook:</strong> Webhooks → New → enter endpoint URL → select event types → Save → Send test event → confirm 200 response in logs.</li>
  <li><strong>Rotate an API key:</strong> API Keys → open key → Regenerate → copy new value immediately (shown once) → update consumer system → delete the old key.</li>
  <li><strong>Update Paystack keys:</strong> Paystack integration → replace public and secret keys → save → verify with a test booking to confirm webhook receipt.</li>
  <li><strong>Add a Slack alert channel:</strong> Slack → add webhook URL and channel name → select trigger events → Save.</li>
  <li><strong>Configure Mapbox:</strong> Mapbox → paste new access token → set style URL → Save → verify maps load in provider and customer apps.</li>
</ol>

<h2>Common issues &amp; gotchas</h2>
<ul>
  <li>Paystack webhook secret must match exactly between Paystack dashboard and this config — a mismatch silently drops all webhook events, causing payment status to never update.</li>
  <li>OneSignal push requires separate app IDs for iOS, Android, and web — do not reuse the same ID across platforms.</li>
  <li>WhatsApp API sessions expire after 24 h without activity; session health is monitored by the comms team.</li>
  <li>Never commit API keys to source control — they live only in the admin UI and server environment variables.</li>
</ul>

<h2>Escalation</h2>
<p>Paystack payment failure → Platform team immediately. Sumsub webhook down → Verification queue will stall, escalate to Platform team and notify Verification Ops.</p>

<h2>Reference for replies</h2>
<p>No public articles directly cover integrations. For provider Yoco POS queries: <a href="/learn/article/yoco-terminal-overview">Yoco Terminal overview</a>.</p>$body$,
  'html', 'published', 'internal', TRUE, NOW()
FROM public.learning_categories c
WHERE c.slug = 'integrations-dev-ops'
AND NOT EXISTS (
  SELECT 1 FROM public.learning_articles a
  WHERE a.slug = 'integrations-dev-runbook' AND a.tenant_id IS NULL
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 11. PLATFORM OPERATIONS RUNBOOK
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.learning_articles
  (category_id, title, slug, summary, body, content_format, status, audience, is_internal, published_at)
SELECT c.id,
  'Platform Operations Runbook',
  'platform-operations-runbook',
  'Internal runbook: service zones, system health, monitoring, and security — keeping the platform available and performant.',
  $body$<p>This internal runbook covers the Operations nav group. It is not visible to customers or providers. See also <a href="/admin/knowledge-base/incident-response-overview">Incident Response</a> and <a href="/admin/knowledge-base/expansion-playbook-overview">Expansion Playbook</a>.</p>

<h2>Purpose</h2>
<p>Keep the platform available, performant, and geographically well-covered: manage service zones, monitor system health, and respond to security events.</p>

<h2>Who uses this section</h2>
<p>Platform/infrastructure team, ops leads, and security team.</p>

<h2>Pages in this section</h2>
<ul>
  <li><strong>Market Coverage</strong> (<code>/admin/service-zones</code>) — geographic service zones displayed on the Mapbox map; configure covered areas and travel boundaries.</li>
  <li><strong>System Health</strong> (<code>/admin/system-health</code>) — live status of API endpoints, database, and third-party services (Paystack, Sumsub, etc.).</li>
  <li><strong>Monitoring</strong> (<code>/admin/monitoring</code>) — error rates, latency, and queue depths; link to Datadog/Sentry dashboards.</li>
  <li><strong>Security</strong> (<code>/admin/security</code>) — recent login anomalies, brute-force attempts, and security event log.</li>
</ul>

<h2>Step-by-step tasks</h2>
<ol>
  <li><strong>Add a service zone:</strong> Market Coverage → draw polygon on map or enter coordinates → set zone name and travel fee rules → Publish. See <a href="/admin/knowledge-base/expansion-playbook-overview">Expansion Playbook</a> for the full launch workflow.</li>
  <li><strong>Check system health:</strong> System Health → review each component status → green = healthy, yellow = degraded, red = down. A red status auto-triggers a Slack alert.</li>
  <li><strong>Investigate a monitoring alert:</strong> Monitoring → find the spike in error rate or latency → filter by endpoint or service → drill into error details → cross-reference with System Health and Incident Response runbook.</li>
  <li><strong>Review security events:</strong> Security → filter by event type (failed logins, permission escalations) → investigate anomalies → block IPs if necessary → record action.</li>
</ol>

<h2>Common issues &amp; gotchas</h2>
<ul>
  <li>Service zone changes take effect immediately — removing a zone prevents customers from booking in that area even if they have a confirmed future booking there.</li>
  <li>System Health is a snapshot; a single failed health check does not mean an outage — confirm with Monitoring before escalating.</li>
  <li>Security event log has a 90-day retention window; export critical events for long-term records.</li>
</ul>

<h2>Escalation</h2>
<p>Active security incident → security lead and platform team immediately. Service degradation → follow <a href="/admin/knowledge-base/incident-response-overview">Incident Response</a> runbook.</p>

<h2>Reference for replies</h2>
<p>For customers or providers reporting app issues: <a href="/learn/article/troubleshooting-faq-overview">Troubleshooting &amp; FAQ</a>.</p>$body$,
  'html', 'published', 'internal', TRUE, NOW()
FROM public.learning_categories c
WHERE c.slug = 'platform-operations-ops'
AND NOT EXISTS (
  SELECT 1 FROM public.learning_articles a
  WHERE a.slug = 'platform-operations-runbook' AND a.tenant_id IS NULL
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 12. PLATFORM CONFIG & SUPERADMIN RUNBOOK
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.learning_articles
  (category_id, title, slug, summary, body, content_format, status, audience, is_internal, published_at)
SELECT c.id,
  'Platform Config & Superadmin Runbook',
  'platform-config-runbook',
  'Internal runbook: settings, tenants, control plane, feature flags, custom fields, app version, referrals, team permissions, and admin team.',
  $body$<p>This internal runbook covers the Platform config nav group. Most pages here are superadmin-only and affect every tenant. Exercise extreme caution. It is not visible to customers or providers.</p>

<h2>Purpose</h2>
<p>Configure the platform at a foundational level: manage tenants, toggle feature flags, set up admin team roles, control compliance processes, and manage referral and custom field settings.</p>

<h2>Who uses this section</h2>
<ul>
  <li><strong>All admin roles</strong> — Feature Flags, Custom Fields, App Version, Referral Settings, Referral sources.</li>
  <li><strong>Superadmin only</strong> — Settings, Tenants, Tenant domains, Control Plane, Safety logs, Compliance purge, Tenant reset, Team permissions, Admin team.</li>
</ul>

<h2>Pages in this section</h2>
<ul>
  <li><strong>Settings</strong> (<code>/admin/settings</code>) <em>[Superadmin]</em> — global platform settings (timezone, currency, booking rules).</li>
  <li><strong>Tenants</strong> (<code>/admin/settings/tenants</code>) <em>[Superadmin]</em> — multi-tenant configuration: create, edit, or deactivate tenants.</li>
  <li><strong>Tenant domains</strong> (<code>/admin/settings/tenant-domains</code>) <em>[Superadmin]</em> — map custom domains to tenants.</li>
  <li><strong>Control Plane</strong> (<code>/admin/control-plane/overview</code>) <em>[Superadmin]</em> — master overview of all control-plane operations.</li>
  <li><strong>Safety logs</strong> (<code>/admin/control-plane/safety-logs</code>) <em>[Superadmin]</em> — AI safety and moderation event logs.</li>
  <li><strong>Compliance purge</strong> (<code>/admin/control-plane/compliance</code>) <em>[Superadmin]</em> — GDPR/POPIA right-to-erasure workflows.</li>
  <li><strong>Tenant reset</strong> (<code>/admin/control-plane/tenant-reset</code>) <em>[Superadmin]</em> — destroy all data for a test tenant. <strong>Irreversible.</strong></li>
  <li><strong>Feature Flags</strong> (<code>/admin/settings/feature-flags</code>) — enable/disable product features per tenant or globally.</li>
  <li><strong>Custom Fields</strong> (<code>/admin/custom-fields</code>) — add provider- or customer-facing metadata fields.</li>
  <li><strong>App Version</strong> (<code>/admin/settings/app-version</code>) — manage forced update thresholds for iOS and Android apps.</li>
  <li><strong>Referral Settings</strong> (<code>/admin/settings/referrals</code>) — reward amounts and expiry for the referral programme.</li>
  <li><strong>Referral sources</strong> (<code>/admin/referral-sources</code>) — UTM/source tracking labels for referral attribution.</li>
  <li><strong>Team permissions</strong> (<code>/admin/settings/team-permissions</code>) <em>[Superadmin]</em> — define role-section access mappings.</li>
  <li><strong>Admin team</strong> (<code>/admin/settings/admin-team</code>) <em>[Superadmin]</em> — invite, edit roles, and remove admin team members.</li>
</ul>

<h2>Step-by-step tasks</h2>
<ol>
  <li><strong>Invite a new admin:</strong> Admin team → Invite → enter email → assign role → Send. The user receives an email to set up their admin account.</li>
  <li><strong>Change an admin role:</strong> Admin team → find user → Edit → change role → Save. Role changes take effect on their next page load.</li>
  <li><strong>Toggle a feature flag:</strong> Feature Flags → find flag by name → toggle On/Off → confirm. Changes are live immediately for the targeted tenant or globally.</li>
  <li><strong>Set forced app update:</strong> App Version → enter minimum supported version for iOS and Android → Save → users on older versions see the update prompt.</li>
  <li><strong>Create a new tenant [Superadmin]:</strong> Tenants → New → configure name, slug, domain, and feature set → Save. Then map a domain in Tenant domains.</li>
  <li><strong>Compliance purge [Superadmin]:</strong> Compliance → enter user ID and right-to-erasure request reference → Confirm → system purges PII from all tables and logs the action. This is irreversible.</li>
</ol>

<h2>Common issues &amp; gotchas</h2>
<ul>
  <li>Tenant Reset is <strong>permanent and irreversible</strong> — only use on demo/test tenants; requires two superadmin confirmations.</li>
  <li>Compliance purge deletes PII but retains anonymised financial records for audit compliance — confirm with legal before purging.</li>
  <li>Feature flag changes are immediate and global (or per-tenant) — always test on a staging tenant before enabling in production.</li>
  <li>Team permissions changes affect all team members with that role immediately — notify them via Slack before changing.</li>
</ul>

<h2>Escalation</h2>
<p>GDPR/POPIA erasure requests → Compliance lead must approve before executing purge. Tenant creation for a paying customer → Sales lead and CTO sign-off. Accidental tenant reset → immediate escalation to CTO.</p>

<h2>Reference for replies</h2>
<p>No direct public articles. For general platform queries: <a href="/learn/article/getting-started-overview">Welcome to Beautonomi</a>.</p>$body$,
  'html', 'published', 'internal', TRUE, NOW()
FROM public.learning_categories c
WHERE c.slug = 'platform-config-ops'
AND NOT EXISTS (
  SELECT 1 FROM public.learning_articles a
  WHERE a.slug = 'platform-config-runbook' AND a.tenant_id IS NULL
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- LEARNING CENTER AUTHORING GUIDE (internal) — helps content editors
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.learning_articles
  (category_id, title, slug, summary, body, content_format, status, audience, is_internal, published_at)
SELECT c.id,
  'Learning Center Authoring Guide',
  'learning-center-authoring-guide',
  'Internal guide: how to author, structure, and publish Learning Center articles including mockup embeds and internal runbooks.',
  $body$<p>This internal guide is for content editors authoring articles in the Learning Center (<code>/admin/content/learning</code>). It is not visible to customers or providers.</p>

<h2>Article body formats</h2>
<ul>
  <li><strong>HTML</strong> (<code>content_format: html</code>) — default. Use the visual TipTap editor.</li>
  <li><strong>Markdown</strong> (<code>content_format: markdown</code>) — legacy; converted on the public site.</li>
</ul>

<h2>Audience field</h2>
<ul>
  <li><strong>General</strong> — shown to everyone on <code>/learn</code>.</li>
  <li><strong>Customer</strong> — shown to customers only on <code>/learn</code>.</li>
  <li><strong>Provider</strong> — shown to providers only on <code>/learn</code>.</li>
  <li><strong>Internal</strong> — only visible in the admin Knowledge Base; never shown on the public site.</li>
</ul>

<h2>Internal articles</h2>
<p>Toggle "Internal" in the article editor to mark an article as internal (<code>is_internal = true</code>). Internal articles appear in <code>/admin/knowledge-base</code> for any admin role but are excluded from the public <code>/learn</code> site and the public search API.</p>

<h2>Embedded app mockups</h2>
<p>Use the <strong>Mockup</strong> button in the toolbar (do not paste raw HTML). The marker stored is:</p>
<pre><code>&lt;div data-learn-mockup="provider-mobile-calendar" data-caption="Your day"&gt;&lt;/div&gt;</code></pre>
<p>In the admin reader, mockup markers render as a placeholder with a "View live" link. The interactive React mockup only renders on <code>/learn</code>.</p>

<h2>Internal runbook template</h2>
<p>All internal section runbooks follow this structure:</p>
<ol>
  <li><strong>Purpose</strong> — one paragraph on why this section exists.</li>
  <li><strong>Who uses this section</strong> — role mapping.</li>
  <li><strong>Pages in this section</strong> — bullet list of every page with URL and superadmin note where relevant.</li>
  <li><strong>Step-by-step tasks</strong> — numbered end-to-end task walkthroughs.</li>
  <li><strong>Managing &amp; configuration</strong> — ongoing admin responsibilities.</li>
  <li><strong>Common issues &amp; gotchas</strong> — known pitfalls.</li>
  <li><strong>Escalation</strong> — who to contact and when.</li>
  <li><strong>Reference for replies</strong> — public article links to share with users.</li>
</ol>

<h2>Training paths</h2>
<p>Articles can be included in role-based training paths (managed via <code>learning_training_paths</code> table). The order of <code>article_slugs</code> in the path determines the step order shown in the Knowledge Base Training Paths tab. To add an article to a path, update the migration or database directly.</p>

<h2>Publishing checklist</h2>
<ul>
  <li>Set <code>status = published</code> and <code>published_at = NOW()</code>.</li>
  <li>Verify audience is correct (Internal for runbooks).</li>
  <li>Check the article renders cleanly in the KB reader at <code>/admin/knowledge-base/{slug}</code>.</li>
  <li>Add a "Reference for replies" section with links to related public articles.</li>
  <li>If the article belongs in a training path, update the path's <code>article_slugs</code> array.</li>
</ul>$body$,
  'html', 'published', 'internal', TRUE, NOW()
FROM public.learning_categories c
WHERE c.slug = 'content-catalog-ops'
AND NOT EXISTS (
  SELECT 1 FROM public.learning_articles a
  WHERE a.slug = 'learning-center-authoring-guide' AND a.tenant_id IS NULL
);
