-- 10130: Learning Center — internal staff runbooks accuracy + coverage pass.
--
-- * Full rewrites (8-section template) of the six legacy ops runbooks from 305/701
--   and of platform-config-runbook (719 text had wrong roles and wrong purge/reset rules).
-- * "Managing & configuration" sections for runbooks that lacked one; heading normalisation.
-- * Stale-reference fixes (refund destination, OneSignal path, Brand inbox path, legacy KYC vendor).
-- * Eight new internal runbooks + stats rows.
-- * Master overview links, training-path slugs and checkpoint questions.
-- Fact sources: docs/learning/_ledger_internal.md
--
-- Idempotent: rewrites are full UPDATEs; patches are guarded by LIKE / NOT LIKE checks;
-- inserts use ON CONFLICT on the global-slug partial unique indexes.

-- ---------------------------------------------------------------------------
-- 0. Categories used by this migration (no-op where they already exist)
-- ---------------------------------------------------------------------------
INSERT INTO public.learning_categories (title, slug, icon, sort_order, audience, visibility)
SELECT v.title, v.slug, NULL, v.sort_order, 'internal', 'internal'
FROM (VALUES
  ('Expansion Playbook',           'expansion-playbook',      43),
  ('Support Desk Operations',      'support-desk-ops',        47),
  ('Finance & Payouts Ops',        'finance-payouts-ops',     50),
  ('Platform Operations',          'platform-operations-ops', 56),
  ('Platform Config & Superadmin', 'platform-config-ops',     57),
  ('Security & Compliance Ops',    'security-compliance-ops', 60)
) AS v(title, slug, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.learning_categories c WHERE c.slug = v.slug AND c.tenant_id IS NULL
);

-- ---------------------------------------------------------------------------
-- A. Full rewrites of legacy runbooks
-- ---------------------------------------------------------------------------

UPDATE public.learning_articles
SET summary = 'How Trust & Safety works the moderation queues in the Trust & Safety Ops hub — user reports, content reports, reviews, blocks, fraud cases and panic-button safety logs — and records every decision.',
    body = $b$<p><strong>Internal runbook</strong> — not visible to customers or providers.</p>

<h2>Purpose</h2>
<p>Keep the marketplace safe and trustworthy: review reported people and content against our policies, act quickly on safety reports, and leave a written rationale for every decision so it can be reconstructed later.</p>

<h2>Who uses it</h2>
<ul>
  <li><strong>Trust &amp; Safety</strong> (Users &amp; trust section: superadmin, admin_trust) — Trust AI queue, User reports, Blocked users, Content reports, Fraud cases, Identity verifications.</li>
  <li><strong>Support / Operations</strong> (Providers &amp; operations section: superadmin, admin_support, admin_operations) — Reviews &amp; ratings and Disputes, which sit inside the Trust hub in the sidebar.</li>
  <li><strong>Superadmins</strong> — Safety logs and the Safety module switch.</li>
</ul>

<h2>Pages in this section</h2>
<ul>
  <li><strong>Trust &amp; Safety Ops</strong> (<code>/admin/trust-safety-ops</code>) — hub with queue counts, SLA pressure and links to every trust queue.</li>
  <li><strong>Trust AI queue</strong> (<code>/admin/trust-safety-ops/ai-queue</code>) — agent suggestions for trust cases; a human approves or rejects each one.</li>
  <li><strong>User Reports</strong> (<code>/admin/user-reports</code>) — reports users file against other users or providers.</li>
  <li><strong>Content Reports</strong> (<code>/admin/content-reports</code>) — reports on Explore posts, comments, messages and reviews.</li>
  <li><strong>Reviews &amp; Ratings</strong> (<code>/admin/reviews</code>) — written reviews and provider-to-customer ratings; hide or moderate.</li>
  <li><strong>Blocked Users</strong> (<code>/admin/user-blocks</code>) — blocks that users created themselves in the apps.</li>
  <li><strong>Fraud Cases</strong> (<code>/admin/fraud-cases</code>) — fraud investigations; a case hold blocks provider payouts until it is released.</li>
  <li><strong>Safety Logs</strong> (<code>/admin/control-plane/safety-logs</code>) <strong>[Superadmin]</strong> — panic-button events raised from booking detail in the apps and web.</li>
  <li><strong>Safety module</strong> (<code>/admin/control-plane/modules/safety</code>) <strong>[Superadmin]</strong> — master switch for the in-app panic button.</li>
  <li><strong>Customers &amp; Users</strong> (<code>/admin/users</code>) and <strong>Providers</strong> (<code>/admin/providers</code>) — account actions (warn, suspend) after a decision.</li>
</ul>

<h2>Step-by-step tasks</h2>
<ol>
  <li><strong>Start of shift:</strong> open Trust &amp; Safety Ops → check open counts and SLA → work the oldest high-severity items first (safety logs, then user reports, then content reports).</li>
  <li><strong>Review a report:</strong> open the item → read the reported content and any message history → compare against <a href="/admin/knowledge-base/policies-overview">policies</a> → decide.</li>
  <li><strong>Act:</strong> dismiss with a note, hide the content or review, warn the user (<code>/admin/users/:id</code> → Warn), suspend the account with a reason, or suspend a provider from <code>/admin/providers/:id</code>.</li>
  <li><strong>Suspected fraud:</strong> open or update a case in Fraud Cases; place a hold if payouts must stop; release it when cleared.</li>
  <li><strong>Panic-button event:</strong> Safety Logs → open the event → contact the parties → follow <a href="/admin/knowledge-base/incident-response-overview">Incident Response</a> if anyone is at risk → mark resolved with notes.</li>
  <li><strong>Always</strong> write the rationale in the notes field before closing.</li>
</ol>

<h2>Managing &amp; configuration</h2>
<ul>
  <li>Turning the Safety module off removes the panic button from customer app, provider app and web — superadmin decision only.</li>
  <li>Trust AI queue items never act on their own: each suggestion needs approve, reject or approve-and-send by a human.</li>
  <li>Every moderation action is written to <strong>Audit Logs</strong> (<code>/admin/audit-logs</code>).</li>
  <li>Identity checks are covered in <a href="/admin/knowledge-base/verification-ops-overview">Verification Ops</a>.</li>
</ul>

<h2>Common issues &amp; gotchas</h2>
<ul>
  <li>A user block is a private user action, not a platform sanction — do not tell a reporter that "we blocked" someone because a block exists.</li>
  <li>Hiding a review does not notify the reviewer; explain the decision through support if they ask.</li>
  <li>Fraud-case holds stop provider payouts — always release the hold when a case is cleared or Finance will see stuck payouts.</li>
  <li>Disputes about money belong in <a href="/admin/knowledge-base/disputes-refund-ops-overview">Disputes &amp; Refund Ops</a>, not in content moderation.</li>
</ul>

<h2>Escalation</h2>
<p>Imminent physical risk or a panic-button event with no response → Trust lead immediately and the Incident Response runbook. Law-enforcement or regulator requests → Compliance lead (see <a href="/admin/knowledge-base/security-compliance-runbook">Security &amp; Compliance</a>). Standard reports → resolve within the queue SLA shown on the hub.</p>

<h2>Reference for replies</h2>
<ul>
  <li><a href="/learn/article/policies-overview">Policies overview</a></li>
  <li><a href="/learn/article/compliance-and-safety">Compliance and safety</a></li>
  <li><a href="/learn/article/reviews-ratings-overview">Reviews and ratings</a></li>
  <li><a href="/learn/article/support-tickets-disputes-overview">Support tickets and disputes</a></li>
</ul>$b$,
    updated_at = NOW()
WHERE slug = 'moderation-safety-ops-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles
SET summary = 'How identity verification is reviewed: Didit sessions for automated KYC, the legacy manual-upload queue, and how to reset a user''s verification safely.',
    body = $b$<p><strong>Internal runbook</strong> — not visible to customers or providers.</p>

<h2>Purpose</h2>
<p>Confirm that providers (and customers where required) are who they say they are, using the Didit identity integration for automated checks and the manual-upload queue for older submissions — while handling identity documents with strict privacy.</p>

<h2>Who uses it</h2>
<ul>
  <li><strong>Trust &amp; Safety</strong> (Users &amp; trust section: superadmin, admin_trust) — Identity Verifications queue.</li>
  <li><strong>Superadmins</strong> — Didit sessions and Didit integration settings.</li>
  <li><strong>Provider onboarding / support</strong> — read status only, to answer "why am I not verified?" questions.</li>
</ul>

<h2>Pages in this section</h2>
<ul>
  <li><strong>Identity Verifications (legacy)</strong> (<code>/admin/verifications</code>) — manual ID uploads; detail at <code>/admin/verifications/:id</code>.</li>
  <li><strong>Identity &amp; Trust — Sessions</strong> (<code>/admin/identity-trust/sessions</code>) <strong>[Superadmin]</strong> — Didit KYC sessions and their outcomes.</li>
  <li><strong>Didit (Identity / KYC)</strong> (<code>/admin/control-plane/integrations/didit</code>) <strong>[Superadmin]</strong> — integration health, test call and verification flags.</li>
  <li><strong>Customers &amp; Users</strong> (<code>/admin/users/:id</code>) — the user's verification status in context.</li>
</ul>

<h2>Step-by-step tasks</h2>
<ol>
  <li><strong>Manual upload:</strong> Identity Verifications → open the oldest pending item → check the document is legible, unexpired and matches the profile name → approve or reject with a reason the user can act on.</li>
  <li><strong>Didit session question:</strong> (superadmin) Identity &amp; Trust — Sessions → find the user → read the session decision before answering the provider.</li>
  <li><strong>Reset a verification:</strong> open the verification detail → Reset identity verification. The user can then verify again. Use only when the original check was wrong or the user's legal name changed.</li>
  <li><strong>Provider asking why they cannot go live:</strong> check their onboarding checklist in Providers before blaming verification — other steps may be missing.</li>
</ol>

<h2>Managing &amp; configuration</h2>
<ul>
  <li>Didit credentials and verification flags live only on the Didit integration page; the manual queue has no settings.</li>
  <li>If Didit health is failing, new automated checks stall — tell support to expect delays and watch the manual queue.</li>
  <li>Verification decisions and resets are written to Audit Logs.</li>
</ul>

<h2>Common issues &amp; gotchas</h2>
<ul>
  <li>Never download, screenshot or forward ID documents outside the admin. Do not paste ID numbers into tickets or Slack.</li>
  <li>The legacy queue only holds manual uploads; a provider verified through Didit will not appear there.</li>
  <li>Write rejection reasons as if the user will read them — factual and actionable ("photo is blurred", "document expired").</li>
</ul>

<h2>Escalation</h2>
<p>Suspected forged documents or a match to a known bad actor → open a Fraud Case and notify the Trust lead. Didit outage → Integrations owner and <a href="/admin/knowledge-base/incident-response-overview">Incident Response</a> if onboarding is blocked platform-wide.</p>

<h2>Reference for replies</h2>
<ul>
  <li><a href="/learn/article/verification-steps">Verification steps</a></li>
  <li><a href="/learn/article/setup-status-checklist">Setup status checklist</a></li>
  <li><a href="/learn/article/provider-onboarding-overview">Provider onboarding overview</a></li>
  <li><a href="/learn/article/security-privacy-overview">Security and privacy</a></li>
</ul>$b$,
    updated_at = NOW()
WHERE slug = 'verification-ops-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles
SET summary = 'How to resolve booking disputes and issue admin refunds: every admin refund credits the customer''s Beautonomi wallet, and cash-out to a bank is a separate customer request paid by Finance.',
    body = $b$<p><strong>Internal runbook</strong> — not visible to customers or providers.</p>

<h2>Purpose</h2>
<p>Resolve disagreements between customers and providers fairly and quickly, and move money correctly when a dispute is upheld. Admin refunds always credit the customer's Beautonomi wallet; they never go back to the card directly.</p>

<h2>Who uses it</h2>
<ul>
  <li><strong>Support / Operations</strong> (Providers &amp; operations section: superadmin, admin_support, admin_operations) — Disputes and Reviews.</li>
  <li><strong>Finance</strong> (Finance section: superadmin, admin_finance) — Refunds, the Wallet → bank queue and Refund Anomalies. The refunds API also accepts the Providers &amp; operations section.</li>
</ul>

<h2>Pages in this section</h2>
<ul>
  <li><strong>Disputes</strong> (<code>/admin/disputes</code>) — open, resolved and closed disputes with the booking context.</li>
  <li><strong>Refunds</strong> (<code>/admin/refunds</code>) — Booking refunds tab and the <strong>Wallet → bank</strong> tab (<code>/admin/refunds?tab=bank</code>).</li>
  <li><strong>Refund Anomalies</strong> (<code>/admin/refund-anomalies</code>) — signals for provider refund abuse and paid custom offers that need recovery.</li>
  <li><strong>Bookings</strong> (<code>/admin/bookings/:id</code>) — payment, cancellation and message history for the booking in dispute.</li>
  <li><strong>Support Tickets</strong> (<code>/admin/support-tickets</code>) — where most disputes start.</li>
</ul>

<h2>Step-by-step tasks</h2>
<ol>
  <li><strong>Gather evidence:</strong> booking detail (status, payments, times), messages, photos and both parties' statements. Ask the provider for their side before deciding.</li>
  <li><strong>Resolve the dispute:</strong> Disputes → open → choose <em>refund full</em>, <em>refund partial</em> (cannot exceed what was collected) or <em>deny</em> → add a resolution note.</li>
  <li><strong>What happens on a refund:</strong> the system checks the finance period is open, records the booking refund, credits the customer's wallet, updates the payment record, restores any gift-card value used, notifies the customer and writes an audit entry.</li>
  <li><strong>Customer wants the money in their bank:</strong> they request it in the app/web at <code>/account-settings/wallet/bank-refund</code>; Finance approves it on the Wallet → bank tab, sends the EFT and marks it paid with the transfer reference (or rejects with a reason).</li>
  <li><strong>Close the loop:</strong> reply on the ticket with the outcome and link the relevant help article.</li>
</ol>

<h2>Managing &amp; configuration</h2>
<ul>
  <li>Wallet → bank settings (enabled, minimum, maximum, fee) sit on the Wallet → bank tab and apply to new customer requests.</li>
  <li>Refunds in a locked period are blocked — Finance must reopen the period in <code>/admin/period-locks</code> or post in the open period.</li>
  <li>Money-path detail (VAT reversal, stale-payment auto refunds) is in <a href="/admin/knowledge-base/money-path-refunds-vat-runbook">Money Path: Refunds &amp; VAT</a>.</li>
</ul>

<h2>Common issues &amp; gotchas</h2>
<ul>
  <li>Do not promise a card refund — the refund lands in the wallet; bank cash-out is a separate request that holds the amount while Finance processes it.</li>
  <li>Cash and card-machine payments taken in person are not collected by the platform; a dispute about them is settled between customer and provider, not with a wallet refund.</li>
  <li>A refund can leave the provider with a negative balance; that is recovered from future earnings, so warn the provider in your resolution note.</li>
  <li>A refund reverses the platform fee and tax proportionally — partial refunds reduce each component, not only the service amount.</li>
</ul>

<h2>Escalation</h2>
<p>High-value disputes, repeat offenders, or threats of legal action → Operations lead. Refund that fails or a negative balance that looks wrong → Finance. Suspected fraud → <a href="/admin/knowledge-base/moderation-safety-ops-overview">Trust &amp; Safety</a> (Fraud Cases).</p>

<h2>Reference for replies</h2>
<ul>
  <li><a href="/learn/article/refunds-and-cancellation-fees">Refunds and cancellation fees</a></li>
  <li><a href="/learn/article/canceling-your-booking">Cancelling your booking</a></li>
  <li><a href="/learn/article/if-provider-cancels">If your provider cancels</a></li>
  <li><a href="/learn/article/support-tickets-disputes-overview">Support tickets and disputes</a></li>
  <li><a href="/learn/article/wallet-gift-cards-coupons-overview">Wallet, gift cards and coupons</a></li>
</ul>$b$,
    updated_at = NOW()
WHERE slug = 'disputes-refund-ops-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles
SET summary = 'How to open a new city or country: service zones and travel fees, markets and domains, the country launch checklist, region payment gateways, FX and taxes, and the market waitlist.',
    body = $b$<p><strong>Internal runbook</strong> — not visible to customers or providers.</p>

<h2>Purpose</h2>
<p>Take a new city or country from "waitlist" to "live" without gaps: correct service areas and travel fees, a configured market (tenant) with its domain, a working payment gateway, currency, FX and tax set up, and a clear go/no-go from the launch checklist.</p>

<h2>Who uses it</h2>
<ul>
  <li><strong>Superadmins</strong> — Markets, Tenant domains, the country launch checklist and region gateways.</li>
  <li><strong>Operations</strong> (Operations section: superadmin, admin_operations, admin_support) — Service Zones.</li>
  <li><strong>Finance</strong> — FX rates and Taxes. <strong>Marketing</strong> — Market waitlist.</li>
</ul>

<h2>Pages in this section</h2>
<ul>
  <li><strong>Service Zones</strong> (<code>/admin/service-zones</code>) — Mapbox-drawn service areas; detail at <code>/admin/service-zones/:id</code>.</li>
  <li><strong>Travel fee &amp; distance</strong> (<code>/admin/providers/distance-settings</code>) — travel-fee rules for at-home services.</li>
  <li><strong>Markets</strong> (<code>/admin/settings/tenants</code>) <strong>[Superadmin]</strong> — tenants per country/market.</li>
  <li><strong>Tenant domains</strong> (<code>/admin/settings/tenant-domains</code>) <strong>[Superadmin]</strong> — domains mapped to each market.</li>
  <li><strong>Country launch checklist</strong> (<code>/admin/control-plane/country-launch-checklist</code>) <strong>[Superadmin]</strong> — go/no-go per market.</li>
  <li><strong>Region online gateway</strong> (<code>/admin/control-plane/region-online-gateway</code>) <strong>[Superadmin]</strong> — primary checkout gateway and secrets per region.</li>
  <li><strong>Market waitlist</strong> (<code>/admin/marketing/market-waitlist</code>) — demand signups per city; promote to lead or export.</li>
  <li><strong>FX rates</strong> (<code>/admin/fx-rates</code>), <strong>Taxes</strong> (<code>/admin/taxes</code>), <strong>ISO codes</strong> (<code>/admin/iso-codes</code>), <strong>Mapbox</strong> (<code>/admin/mapbox</code>).</li>
</ul>

<h2>Step-by-step tasks</h2>
<ol>
  <li><strong>Validate demand:</strong> Market waitlist → filter by city → export or promote strong signups to Provider Ops leads.</li>
  <li><strong>New city in an existing country:</strong> draw the zone in Service Zones → confirm travel-fee rules → check providers in the area are assigned → announce.</li>
  <li><strong>New country:</strong> follow <a href="/admin/knowledge-base/country-launch-regions-runbook">Country Launch &amp; Regions</a> — market, domain, gateway, currency, FX, tax, templates — until the checklist shows READY TO LAUNCH.</li>
  <li><strong>After launch:</strong> watch bookings and payments for the market for the first week; keep the waitlist link live for cities not yet open.</li>
</ol>

<h2>Managing &amp; configuration</h2>
<ul>
  <li>Make large boundary changes outside peak booking hours and check a few provider listings afterwards.</li>
  <li>Taxes resolve by country (from the market's region code), with provider overrides taking priority.</li>
  <li>Reporting converts every currency to ZAR using FX rates — a market without a rate fails the checklist.</li>
</ul>

<h2>Common issues &amp; gotchas</h2>
<ul>
  <li>Check neighbouring zones before saving so boundaries do not overlap.</li>
  <li>A market can be active with no payment gateway configured; customers then cannot pay online. Always run the checklist.</li>
  <li>The default ZA market is protected in compliance tooling — never test a launch by resetting it.</li>
</ul>

<h2>Escalation</h2>
<p>Gateway or secret failures → Integrations owner (superadmin). Tax or VAT questions for a new country → Finance lead before launch. Launch date changes → Marketing so the waitlist messaging stays accurate.</p>

<h2>Reference for replies</h2>
<ul>
  <li><a href="/learn/article/provider-onboarding-overview">Provider onboarding overview</a></li>
  <li><a href="/learn/article/setup-status-checklist">Setup status checklist</a></li>
  <li><a href="/learn/article/policies-overview">Policies overview</a></li>
</ul>$b$,
    updated_at = NOW()
WHERE slug = 'expansion-playbook-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles
SET summary = 'How to detect, declare, mitigate and close a platform incident using Platform Health, cron and workflow runs, inbound webhooks, maintenance mode, feature flags and GRC incidents.',
    body = $b$<p><strong>Internal runbook</strong> — not visible to customers or providers.</p>

<h2>Purpose</h2>
<p>Give everyone the same playbook when something breaks: confirm the problem, declare a severity, limit customer impact, communicate, and record the incident so we learn from it.</p>

<h2>Who uses it</h2>
<ul>
  <li><strong>On-call engineers and superadmins</strong> — Cron runs, Workflow runs, Inbound webhooks, Maintenance, feature flags.</li>
  <li><strong>Operations / support leads</strong> (Operations section) — Platform Health and customer communication.</li>
  <li><strong>GRC</strong> (Security &amp; compliance section: superadmin, admin_grc) — the incident record.</li>
</ul>

<h2>Pages in this section</h2>
<ul>
  <li><strong>Platform Health</strong> (<code>/admin/system-health</code>) — component status and monitoring health checks.</li>
  <li><strong>Cron runs</strong> (<code>/admin/cron-runs</code>) <strong>[Superadmin]</strong> — scheduled job history and failures.</li>
  <li><strong>Workflow runs</strong> (<code>/admin/workflow-runs</code>) <strong>[Superadmin]</strong> — background workflow executions.</li>
  <li><strong>Inbound webhooks</strong> (<code>/admin/webhooks/inbound</code>) <strong>[Superadmin]</strong> — Paystack, Stripe and Flutterwave events received.</li>
  <li><strong>Maintenance</strong> (<code>/admin/control-plane/maintenance</code>) <strong>[Superadmin]</strong> — maintenance screens per surface.</li>
  <li><strong>Feature Flags</strong> (<code>/admin/settings/feature-flags</code>) — kill switches for broken features.</li>
  <li><strong>GRC Incidents</strong> (<code>/admin/grc/incidents</code>) — the formal incident record.</li>
  <li><strong>Slack</strong> (<code>/admin/integrations/slack</code>) — alert channels.</li>
</ul>

<h2>Step-by-step tasks</h2>
<ol>
  <li><strong>Detect:</strong> confirm on Platform Health, Cron runs or Inbound webhooks; reproduce once.</li>
  <li><strong>Declare:</strong> Sev1 = payments or bookings down for everyone; Sev2 = a major feature or a whole market degraded; Sev3 = minor or single-user. Post in the incident Slack channel.</li>
  <li><strong>Mitigate:</strong> turn off the broken feature with its flag, or enable Maintenance for the affected surface. Keep provider onboarding and checkout open unless they are the problem.</li>
  <li><strong>Communicate:</strong> support uses a single holding reply; the incident lead posts regular updates in the incident channel until resolved.</li>
  <li><strong>Resolve:</strong> confirm recovery on the same pages, switch Maintenance and flags back, replay or retry failed jobs.</li>
  <li><strong>Record:</strong> create or update the incident in GRC Incidents with timeline, impact and follow-ups.</li>
</ol>

<h2>Managing &amp; configuration</h2>
<ul>
  <li>Maintenance settings are per scope (public site, provider web, customer app, provider app) — see <a href="/admin/knowledge-base/platform-maintenance-audit-runbook">Maintenance &amp; Audit</a>.</li>
  <li>Every flag and module change appears in the config change log (<code>/admin/control-plane/audit-log</code>) — use it to answer "what changed?".</li>
  <li>Unmatched payment events land in Reconciliation Exceptions for Finance after an outage.</li>
</ul>

<h2>Common issues &amp; gotchas</h2>
<ul>
  <li>Admin access needs two-step verification — an incident responder who is not enrolled will be sent to <code>/admin/mfa/enroll</code>; enrol before you are on call.</li>
  <li>Maintenance on the public site still lets people sign in and sign up; it is not an outage page for logged-in users.</li>
  <li>Do not post refund or ledger corrections by hand during an incident — leave money fixes to Finance once the platform is stable.</li>
</ul>

<h2>Escalation</h2>
<p>Sev1 → on-call engineer and CTO immediately. Data breach suspected → GRC lead and <a href="/admin/knowledge-base/security-compliance-runbook">Security &amp; Compliance</a> (notification duties). Payment provider outage → Finance lead.</p>

<h2>Reference for replies</h2>
<ul>
  <li><a href="/learn/article/troubleshooting-faq-overview">Troubleshooting FAQ</a></li>
  <li><a href="/learn/article/security-privacy-overview">Security and privacy</a></li>
</ul>$b$,
    updated_at = NOW()
WHERE slug = 'incident-response-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles
SET summary = 'How provider subscription billing works: plans with Paystack plan codes and Apple product IDs, provider subscriptions and invoices, platform fees, and the Apple in-app purchase pages.',
    body = $b$<p><strong>Internal runbook</strong> — not visible to customers or providers.</p>

<h2>Purpose</h2>
<p>Run provider subscription billing correctly: plan setup, renewals, failed payments, invoices and Apple in-app purchases — and know where platform fee rules live.</p>

<h2>Who uses it</h2>
<ul>
  <li><strong>Superadmins</strong> — every page below is superadmin-only.</li>
  <li><strong>Finance</strong> (Finance section) — reads Subscription Revenue figures through a superadmin and handles invoice questions.</li>
</ul>

<h2>Pages in this section</h2>
<ul>
  <li><strong>Plans</strong> (<code>/admin/plans</code>) <strong>[Superadmin]</strong> — plan tiers, Paystack plan codes (monthly / yearly) and Apple product IDs.</li>
  <li><strong>Provider subscriptions</strong> (<code>/admin/provider-subscriptions</code>) <strong>[Superadmin]</strong> — each provider's plan and status.</li>
  <li><strong>Subscription revenue</strong> (<code>/admin/subscription-revenue</code>) <strong>[Superadmin]</strong> — recurring revenue reporting.</li>
  <li><strong>Billing</strong> (<code>/admin/billing</code>) <strong>[Superadmin]</strong> — invoices and provider subscription billing.</li>
  <li><strong>Platform fees</strong> (<code>/admin/settings/platform-fees</code>) <strong>[Superadmin]</strong> — customer-paid fees and commission.</li>
  <li><strong>Apple IAP</strong> <strong>[Superadmin]</strong>: setup sheet (<code>/admin/monetization/apple/setup-sheet</code>), products (<code>/admin/monetization/apple/products</code>), transactions (<code>/admin/monetization/apple/transactions</code>), server notifications (<code>/admin/monetization/apple/notifications</code>), settlements (<code>/admin/monetization/apple/settlements</code>).</li>
  <li><strong>Apple App Store Connect</strong> (<code>/admin/integrations/apple</code>) <strong>[Superadmin]</strong> — credentials used by the IAP pages.</li>
</ul>

<h2>Step-by-step tasks</h2>
<ol>
  <li><strong>Provider says they were charged twice:</strong> Provider subscriptions → find the provider → compare with Billing invoices and, for iOS purchases, Apple transactions.</li>
  <li><strong>Failed renewal:</strong> check status in Provider subscriptions → ask the provider to update the card in their subscription settings → confirm the next charge.</li>
  <li><strong>New or changed plan:</strong> create the plan in Paystack and App Store Connect first → add the codes / product IDs in Plans → verify in the Apple setup sheet.</li>
  <li><strong>Month end:</strong> reconcile Subscription revenue with Billing and Apple settlements.</li>
</ol>

<h2>Managing &amp; configuration</h2>
<ul>
  <li>A plan without the matching Paystack code or Apple product ID cannot be bought on that channel.</li>
  <li>Subscription revenue is platform revenue; it is never paid out to providers.</li>
  <li>Announce platform fee changes to providers before saving them.</li>
</ul>

<h2>Common issues &amp; gotchas</h2>
<ul>
  <li>iOS subscriptions are managed by Apple — refunds and cancellations for them happen in the customer's Apple account, not in our admin.</li>
  <li>Check the Apple notifications page before assuming an iOS renewal failed.</li>
  <li>Booking commission and payroll are separate from subscription billing — see <a href="/admin/knowledge-base/finance-payouts-runbook">Finance &amp; Payouts</a>.</li>
</ul>

<h2>Escalation</h2>
<p>Billing errors affecting many providers → Finance lead and CTO. Apple or Paystack account issues → superadmin who owns the integration.</p>

<h2>Reference for replies</h2>
<ul>
  <li><a href="/learn/article/provider-web-subscription-plan">Your subscription plan</a></li>
  <li><a href="/learn/article/understanding-earnings">Understanding earnings</a></li>
  <li><a href="/learn/article/payouts-earnings-overview">Payouts and earnings</a></li>
</ul>$b$,
    updated_at = NOW()
WHERE slug = 'billing-ops-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles
SET summary = 'Platform configuration pages: feature flags, admin team and permissions, general settings, app versions, custom fields, referrals, markets and domains, Platform Advanced, compliance purge and tenant reset.',
    body = $b$<p><strong>Internal runbook</strong> — not visible to customers or providers.</p>

<h2>Purpose</h2>
<p>Change how the platform behaves — flags, admin access, global settings, markets — safely, and know which pages are irreversible.</p>

<h2>Who uses it</h2>
<ul>
  <li><strong>Platform config admins</strong> (Platform config section: superadmin, admin_platform_config) — Feature flags, General settings, App version, Custom fields, Referral settings.</li>
  <li><strong>Superadmins</strong> — Admin team, Team permissions, Markets, Tenant domains, Platform Advanced, Compliance purge, Tenant reset.</li>
</ul>

<h2>Pages in this section</h2>
<ul>
  <li><strong>Platform config</strong> (<code>/admin/platform-config</code>) — hub for the pages below.</li>
  <li><strong>Feature Flags</strong> (<code>/admin/settings/feature-flags</code>) — create, toggle and edit flags; preview resolution.</li>
  <li><strong>Admin team</strong> (<code>/admin/settings/admin-team</code>) <strong>[Superadmin]</strong> — invite admins and change their roles.</li>
  <li><strong>Team permissions</strong> (<code>/admin/settings/team-permissions</code>) <strong>[Superadmin]</strong> — which roles can open each admin section.</li>
  <li><strong>General Settings</strong> (<code>/admin/settings</code>) — global platform settings, including payout-account cooling-off.</li>
  <li><strong>App version</strong> (<code>/admin/settings/app-version</code>) — minimum and latest versions plus store URLs for the customer and provider apps (iOS and Android).</li>
  <li><strong>Custom fields</strong> (<code>/admin/settings/custom-fields</code>) — extra metadata fields on providers, customers and bookings.</li>
  <li><strong>Referral settings</strong> (<code>/admin/settings/referrals</code>) — referral programme rules and FAQs.</li>
  <li><strong>Referral sources</strong> (<code>/admin/referral-sources</code>) — per-provider "how did you hear about us" sources (Providers &amp; operations section).</li>
  <li><strong>Markets</strong> (<code>/admin/settings/tenants</code>) and <strong>Tenant domains</strong> (<code>/admin/settings/tenant-domains</code>) <strong>[Superadmin]</strong>.</li>
  <li><strong>Platform Advanced</strong> (<code>/admin/control-plane/overview</code>) <strong>[Superadmin]</strong> — modules, integrations, AI and audit; see <a href="/admin/knowledge-base/control-plane-modules-runbook">Control Plane Modules</a>.</li>
  <li><strong>Compliance purge</strong> (<code>/admin/control-plane/compliance</code>) and <strong>Tenant reset</strong> (<code>/admin/control-plane/tenant-reset</code>) <strong>[Superadmin]</strong> — see <a href="/admin/knowledge-base/compliance-purge-reset-runbook">Compliance Purge &amp; Tenant Reset</a>.</li>
</ul>

<h2>Step-by-step tasks</h2>
<ol>
  <li><strong>Roll out a feature:</strong> Feature Flags → find the key → check the preview → enable → watch Platform Health and support tickets for an hour.</li>
  <li><strong>Add an admin:</strong> (superadmin) Admin team → invite with the narrowest role that fits → the new admin must enrol two-step verification on first sign-in.</li>
  <li><strong>Change section access:</strong> (superadmin) Team permissions → adjust the matrix → save → ask an affected admin to refresh.</li>
  <li><strong>Force an app update:</strong> App version → raise the minimum version only after the build is live in both stores.</li>
</ol>

<h2>Managing &amp; configuration</h2>
<ul>
  <li>Flag, integration and module changes are logged in the config change log (<code>/admin/control-plane/audit-log</code>); everything else is in Audit Logs.</li>
  <li>The read-only flag resolver at <code>/admin/control-plane/feature-flags</code> <strong>[Superadmin]</strong> shows the effective value per market.</li>
  <li>Payout cooling-off (General Settings → payouts): new-account hold of 48 hours by default; first account exempt by default; admin-added accounts held by default.</li>
</ul>

<h2>Common issues &amp; gotchas</h2>
<ul>
  <li>Raising the minimum app version too early locks users out until the store review completes.</li>
  <li>Removing a role from a section in Team permissions removes it for every admin with that role.</li>
  <li>Compliance purge and tenant reset are irreversible; always run the preview (dry run) first.</li>
</ul>

<h2>Escalation</h2>
<p>Erasure (DSAR / POPIA / GDPR) requests → Compliance lead approval before any purge. New paying market → Sales lead and CTO sign-off. Accidental reset or purge → CTO immediately.</p>

<h2>Reference for replies</h2>
<ul>
  <li><a href="/learn/article/security-privacy-overview">Security and privacy</a></li>
  <li><a href="/learn/article/account-profile-overview">Account and profile</a></li>
  <li><a href="/learn/article/policies-overview">Policies overview</a></li>
</ul>$b$,
    updated_at = NOW()
WHERE slug = 'platform-config-runbook' AND tenant_id IS NULL;

-- ---------------------------------------------------------------------------
-- B. Heading normalisation + Managing sections for runbooks that lack one
-- ---------------------------------------------------------------------------

UPDATE public.learning_articles
SET body = replace(body, '<h2>Who uses this section</h2>', '<h2>Who uses it</h2>'),
    updated_at = NOW()
WHERE tenant_id IS NULL AND is_internal = true
  AND body LIKE '%<h2>Who uses this section</h2>%';

UPDATE public.learning_articles
SET body = replace(body, '<h2>Reference</h2>', '<h2>Reference for replies</h2>'),
    updated_at = NOW()
WHERE tenant_id IS NULL AND is_internal = true
  AND body LIKE '%<h2>Reference</h2>%';

WITH managing(slug, section) AS (VALUES
  ('admin-overview-runbook', $b$<h2>Managing &amp; configuration</h2>
<ul>
  <li><strong>Notifications inbox</strong> (<code>/admin/notifications/inbox</code>) — your own admin notifications: mark read, mark all read, delete or bulk delete. It is not the Notification Center.</li>
  <li>Dashboard and Reports respect the market (tenant) picker in the header — switch market before comparing numbers.</li>
  <li>Analytics and Geo &amp; Devices are <strong>[Superadmin]</strong>; other roles see Dashboard and Reports only.</li>
  <li>Knowledge Base articles are edited in <code>/admin/content/learning</code>; training paths in <code>/admin/content/learning/training-paths</code> (Content &amp; catalog section).</li>
</ul>
$b$),
  ('finance-payouts-runbook', $b$<h2>Managing &amp; configuration</h2>
<ul>
  <li><strong>Period locks</strong> (<code>/admin/period-locks</code>) — refunds, adjustments and repairs into a locked period are refused.</li>
  <li><strong>Payout cooling-off</strong> — set in General Settings (<code>/admin/settings</code>): new bank accounts are held 48 hours by default before payouts.</li>
  <li><strong>Payroll rule sets</strong> (<code>/admin/payroll-rules</code>) — two different admins must verify a set before it can be published; see <a href="/admin/knowledge-base/payroll-ops-runbook">Payroll Ops</a>.</li>
  <li><strong>Refund Anomalies</strong> (<code>/admin/refund-anomalies</code>) — provider refund-abuse signals and paid custom offers to recover; see <a href="/admin/knowledge-base/money-path-refunds-vat-runbook">Money Path: Refunds &amp; VAT</a>.</li>
</ul>
$b$),
  ('ecommerce-runbook', $b$<h2>Managing &amp; configuration</h2>
<ul>
  <li>Return resolutions are full refund, partial refund, replacement, store credit or denied. Every refund resolution is paid as store credit to the customer's wallet.</li>
  <li>Global categories (<code>/admin/catalog/global-categories</code>) drive product and service browsing; rename rather than delete categories that are in use.</li>
  <li>Add-ons (<code>/admin/addons</code>) are extras offered with services; check which providers use one before disabling it.</li>
</ul>
$b$),
  ('marketing-comms-runbook', $b$<h2>Managing &amp; configuration</h2>
<ul>
  <li><strong>Marketing Ops</strong> (<code>/admin/marketing</code>) — hub for campaigns, broadcasts and templates.</li>
  <li><strong>Notification Center</strong> (<code>/admin/notifications</code>) — push, email, SMS and in-app channel settings, test sends and the WhatsApp delivery log. OneSignal keys are set at <code>/admin/integrations/onesignal</code> <strong>[Superadmin]</strong> and stored server-side.</li>
  <li><strong>Gamification</strong> (<code>/admin/gamification</code>) — points and badges hub, with point rules (<code>/admin/gamification/point-rules</code>), badges (<code>/admin/gamification/badges</code>) and operations (<code>/admin/gamification/operations</code>).</li>
  <li><strong>Broadcasts</strong> — compose at <code>/admin/broadcast/compose</code>, history at <code>/admin/broadcast/history</code>.</li>
</ul>
$b$),
  ('integrations-dev-runbook', $b$<h2>Managing &amp; configuration</h2>
<ul>
  <li><strong>Integrations</strong> hub (<code>/admin/integrations-hub</code>) — payment, messaging and analytics connectors in one place.</li>
  <li><strong>Platform integrations</strong> (<code>/admin/control-plane/integrations</code>) <strong>[Superadmin]</strong> — AI, Didit, Aura and region checkout status.</li>
  <li>Saved secrets are never shown again; leave a secret field blank to keep the current value.</li>
  <li>Integration changes are recorded in the config change log (<code>/admin/control-plane/audit-log</code>).</li>
</ul>
$b$),
  ('platform-operations-runbook', $b$<h2>Managing &amp; configuration</h2>
<ul>
  <li><strong>Operations</strong> hub (<code>/admin/operations</code>) — Platform Health, Service Zones, Security Policy and God's Eye in one place.</li>
  <li><strong>Security Policy</strong> (<code>/admin/security</code>) — admin two-step verification, provider session protection, login rate limits, data retention and the admin IP allowlist; see <a href="/admin/knowledge-base/admin-security-mfa-sessions-runbook">Admin Security, MFA &amp; Sessions</a>.</li>
  <li><strong>Maintenance</strong> and the config change log — see <a href="/admin/knowledge-base/platform-maintenance-audit-runbook">Maintenance &amp; Audit</a>.</li>
</ul>
$b$),
  ('commercial-ops-runbook', $b$<h2>Managing &amp; configuration</h2>
<ul>
  <li>Products, vendors and collection locations are reference data for onboarding and orders — update them before a campaign starts, not during it.</li>
  <li>Each application has its own detail page (<code>/admin/commercial/terminal-onboarding/:id</code>); open it from the onboarding list.</li>
  <li>Gateway credentials are not edited here; they sit on the integration pages <code>/admin/integrations/yoco</code> and <code>/admin/integrations/paycloud</code> <strong>[Superadmin]</strong>.</li>
</ul>
$b$),
  ('brand-desk-runbook', $b$<h2>Managing &amp; configuration</h2>
<ul>
  <li>The Brand desk only shows in the sidebar when the <code>brand_desk</code> feature flag is on (superadmins always see it).</li>
  <li><strong>Brand settings</strong> (<code>/admin/brand/settings</code>) — per-market thresholds, pack cadence and governance rules.</li>
  <li><strong>Strategy</strong> (<code>/admin/brand/strategy</code>) — pillars, quarterly plans and the KPI scorecard that briefs should map to.</li>
</ul>
$b$),
  ('security-compliance-runbook', $b$<h2>Managing &amp; configuration</h2>
<ul>
  <li>GRC pages need the Security &amp; compliance section (superadmin, admin_grc).</li>
  <li><strong>Setup</strong> (<code>/admin/grc/setup</code>) is the starting point for the programme; <strong>GRC settings</strong> (<code>/admin/grc/settings</code>) holds hub configuration.</li>
  <li><strong>Compliance modules</strong> (<code>/admin/grc/compliance-modules</code>) is an old link that now opens Controls (<code>/admin/grc/controls</code>).</li>
  <li>Admin MFA and session policy: <a href="/admin/knowledge-base/admin-security-mfa-sessions-runbook">Admin Security, MFA &amp; Sessions</a>. Erasure requests: <a href="/admin/knowledge-base/compliance-purge-reset-runbook">Compliance Purge &amp; Tenant Reset</a>.</li>
</ul>
$b$)
)
UPDATE public.learning_articles a
SET body = replace(a.body, '<h2>Common issues &amp; gotchas</h2>', m.section || '<h2>Common issues &amp; gotchas</h2>'),
    updated_at = NOW()
FROM managing m
WHERE a.slug = m.slug AND a.tenant_id IS NULL
  AND a.body NOT LIKE '%Managing &amp; configuration%'
  AND a.body LIKE '%<h2>Common issues &amp; gotchas</h2>%';

-- ---------------------------------------------------------------------------
-- C. Stale-reference fixes
-- ---------------------------------------------------------------------------

UPDATE public.learning_articles
SET body = replace(body,
  '<p>No public articles directly cover integrations. For provider Yoco POS queries: <a href="/learn/article/yoco-terminal-overview">Yoco Terminal overview</a>.</p>',
  '<p>No public articles directly cover integrations. For provider card-machine queries: <a href="/learn/article/card-machines-faq">Card machines FAQ</a> and <a href="/learn/article/card-machines-troubleshooting">Card machine troubleshooting</a>.</p>'),
    updated_at = NOW()
WHERE slug = 'integrations-dev-runbook' AND tenant_id IS NULL
  AND body LIKE '%/learn/article/yoco-terminal-overview%';

UPDATE public.learning_articles
SET body = replace(replace(replace(body,
  '<li><strong>Integrations Hub</strong> (<code>/admin/control-plane/integrations</code>) <em>[Superadmin]</em> — master toggle and config for all third-party services.</li>',
  '<li><strong>Integrations</strong> (<code>/admin/integrations-hub</code>) — hub for payment, messaging and analytics connectors.</li><li><strong>Platform integrations</strong> (<code>/admin/control-plane/integrations</code>) <strong>[Superadmin]</strong> — AI, Didit, Aura and region checkout status.</li>'),
  '<li><strong>Paystack</strong> (<code>/admin/integrations/paystack</code>) —',
  '<li><strong>Paystack</strong> (<code>/admin/integrations/paystack</code>) <strong>[Superadmin]</strong> —'),
  '<li><strong>OneSignal</strong> (<code>/admin/integrations/onesignal</code>) —',
  '<li><strong>OneSignal</strong> (<code>/admin/integrations/onesignal</code>) <strong>[Superadmin]</strong> —'),
    updated_at = NOW()
WHERE slug = 'integrations-dev-runbook' AND tenant_id IS NULL
  AND (body LIKE '%master toggle and config for all third-party services%'
    OR body LIKE '%/admin/integrations/paystack</code>) —%'
    OR body LIKE '%/admin/integrations/onesignal</code>) —%');

UPDATE public.learning_articles
SET body = replace(body,
  '<li><strong>Notifications</strong> (<code>/admin/notifications</code>) — push/in-app notification settings and OneSignal configuration.</li>',
  '<li><strong>Notification Center</strong> (<code>/admin/notifications</code>) — push, email, SMS and in-app channel settings, test sends and delivery logs.</li><li><strong>OneSignal</strong> (<code>/admin/integrations/onesignal</code>) <strong>[Superadmin]</strong> — push app ID and REST key.</li>'),
    updated_at = NOW()
WHERE slug = 'marketing-comms-runbook' AND tenant_id IS NULL
  AND body LIKE '%push/in-app notification settings and OneSignal configuration%';

UPDATE public.learning_articles
SET body = replace(body,
  '<li><strong>My work</strong> (<code>/admin/brand</code>) — dashboard: briefs in review, live campaigns, weekly update tasks.</li>',
  '<li><strong>Brand inbox</strong> (<code>/admin/brand/my-work</code>) — your approvals and open tasks; <code>/admin/brand</code> opens the Brand desk hub.</li><li><strong>Strategy</strong> (<code>/admin/brand/strategy</code>) — pillars, quarterly plans, KPI scorecard.</li><li><strong>Calendar</strong> (<code>/admin/brand/calendar</code>) — campaign flights with clash warnings.</li>'),
    updated_at = NOW()
WHERE slug = 'brand-desk-runbook' AND tenant_id IS NULL
  AND body NOT LIKE '%/admin/brand/my-work%';

UPDATE public.learning_articles
SET body = replace(replace(replace(body,
  '<li><strong>Refunds</strong> (<code>/admin/refunds</code>) — initiate and track refunds against Paystack payments.</li>',
  '<li><strong>Refunds</strong> (<code>/admin/refunds</code>) — booking refunds and the Wallet → bank queue. Admin refunds credit the customer''s wallet.</li>'),
  '<li><strong>Process a refund:</strong> Bookings → open booking → verify it was paid via Paystack (in-person Yoco/cash cannot be refunded via platform) → go to Refunds → create refund referencing the booking ID → amount returns to original payment method.</li>',
  '<li><strong>Process a refund:</strong> Bookings → open booking → confirm it was paid online (in-person card-machine or cash payments are not refundable through the platform) → resolve through Disputes or Refunds → the amount is credited to the customer''s Beautonomi wallet. See <a href="/admin/knowledge-base/disputes-refund-ops-overview">Disputes &amp; Refund Ops</a>.</li>'),
  '<li>Refunds are processed via Paystack API — confirm fund availability before initiating large refunds.</li>',
  '<li>Admin refunds go to the customer''s wallet, not back to the card. A customer who wants cash requests a bank refund at <code>/account-settings/wallet/bank-refund</code> and Finance pays it by EFT.</li>'),
    updated_at = NOW()
WHERE slug = 'providers-bookings-runbook' AND tenant_id IS NULL
  AND body LIKE '%against Paystack payments%';

UPDATE public.learning_articles
SET body = replace(body,
  'Approve (triggers refund to original payment method) or Reject with reason.',
  'choose a resolution (full refund, partial refund, replacement, store credit or denied) and add notes. Refund resolutions are paid as store credit to the customer''s wallet.'),
    updated_at = NOW()
WHERE slug = 'ecommerce-runbook' AND tenant_id IS NULL
  AND body LIKE '%triggers refund to original payment method%';

UPDATE public.learning_articles
SET body = replace(body,
  '<li><strong>Apple IAP</strong> (<code>/admin/monetization/apple/*</code>) <em>[Superadmin]</em> — setup sheet, products, transactions, notifications, settlements.</li>',
  '<li><strong>Apple IAP</strong> <strong>[Superadmin]</strong> — <code>/admin/monetization/apple/setup-sheet</code>, <code>/admin/monetization/apple/products</code>, <code>/admin/monetization/apple/transactions</code>, <code>/admin/monetization/apple/notifications</code>, <code>/admin/monetization/apple/settlements</code>. See <a href="/admin/knowledge-base/billing-ops-overview">Billing Ops</a>.</li>'),
    updated_at = NOW()
WHERE slug = 'finance-payouts-runbook' AND tenant_id IS NULL
  AND body LIKE '%/admin/monetization/apple/*%';

-- Legacy KYC vendor: point the users-trust hint at the Didit page, then sweep any remaining mention.
UPDATE public.learning_articles
SET body = regexp_replace(body, 'check Integrations &gt; S[u]msub', 'check Didit (<code>/admin/control-plane/integrations/didit</code>) <strong>[Superadmin]</strong>', 'g'),
    updated_at = NOW()
WHERE slug = 'users-trust-runbook' AND tenant_id IS NULL
  AND body ~ 'Integrations &gt; S[u]msub';

UPDATE public.learning_articles
SET body = regexp_replace(body, 'S[u]msub', 'Didit', 'g'),
    summary = regexp_replace(summary, 'S[u]msub', 'Didit', 'g'),
    updated_at = NOW()
WHERE tenant_id IS NULL AND is_internal = true
  AND (body ~* 's[u]msub' OR summary ~* 's[u]msub');

-- ---------------------------------------------------------------------------
-- D1. "Additional pages" appends for nav hrefs not covered elsewhere
-- ---------------------------------------------------------------------------

UPDATE public.learning_articles
SET body = body || $b$
<h2>Additional pages</h2>
<ul>
  <li><strong>Explore sounds</strong> (<code>/admin/explore/sounds</code>) — platform music library for provider Explore videos; hide or show tracks.</li>
  <li><strong>CMS pages</strong> (<code>/admin/content/pages</code>), <strong>About us</strong> (<code>/admin/content/about-us</code>), <strong>Featured cities</strong> (<code>/admin/content/featured-cities</code>) and <strong>App links</strong> (<code>/admin/content/app-links</code>) — site sections, discovery cities and app download links.</li>
  <li><strong>Training paths</strong> (<code>/admin/content/learning/training-paths</code>) — role-based staff paths and their checkpoint quizzes.</li>
  <li>Explore video encoding runs through <strong>Rendobar</strong> (<code>/admin/integrations/rendobar</code>) <strong>[Superadmin]</strong>; stuck videos are an integrations issue.</li>
</ul>
$b$,
    updated_at = NOW()
WHERE slug = 'content-catalog-runbook' AND tenant_id IS NULL
  AND body NOT LIKE '%/admin/explore/sounds%';

UPDATE public.learning_articles
SET body = body || $b$
<h2>Additional pages</h2>
<ul>
  <li><strong>Rendobar</strong> (<code>/admin/integrations/rendobar</code>) <strong>[Superadmin]</strong> — Explore video probe/encode jobs and the callback signing secret.</li>
  <li><strong>Stripe</strong> (<code>/admin/control-plane/integrations/stripe</code>) <strong>[Superadmin]</strong> — platform hosted Checkout plus Connect for provider payouts.</li>
  <li><strong>WhatsApp (Wasender)</strong> (<code>/admin/control-plane/integrations/wasender</code>) <strong>[Superadmin]</strong> — WasenderAPI token for WhatsApp sending.</li>
  <li><strong>Zoho Mail</strong> (<code>/admin/integrations/zoho-mail</code>) — support mailbox connection, sync and quarantine; see <a href="/admin/knowledge-base/support-mail-ingest-runbook">Support Mail Ingest</a>.</li>
  <li>Region checkout gateways are set per region in <code>/admin/control-plane/region-online-gateway</code> <strong>[Superadmin]</strong>; see <a href="/admin/knowledge-base/country-launch-regions-runbook">Country Launch &amp; Regions</a>.</li>
</ul>
$b$,
    updated_at = NOW()
WHERE slug = 'integrations-dev-runbook' AND tenant_id IS NULL
  AND body NOT LIKE '%/admin/integrations/rendobar%';

UPDATE public.learning_articles
SET body = body || $b$
<h2>Additional pages</h2>
<ul>
  <li><strong>Trust &amp; Safety Ops</strong> (<code>/admin/trust-safety-ops</code>) — hub for every trust queue; working the queues is covered in <a href="/admin/knowledge-base/moderation-safety-ops-overview">Moderation &amp; Safety Ops</a>.</li>
  <li><strong>Account security</strong> on <code>/admin/users/:id</code> — 2FA status, trusted devices, Sign out everywhere and Reset 2FA; see <a href="/admin/knowledge-base/admin-security-mfa-sessions-runbook">Admin Security, MFA &amp; Sessions</a>.</li>
</ul>
$b$,
    updated_at = NOW()
WHERE slug = 'users-trust-runbook' AND tenant_id IS NULL
  AND body NOT LIKE '%/admin/trust-safety-ops</code>%';

UPDATE public.learning_articles
SET body = body || $b$
<h2>Additional pages</h2>
<ul>
  <li><strong>Platform config</strong> (<code>/admin/platform-config</code>) hub and <strong>Custom fields</strong> (<code>/admin/settings/custom-fields</code>) — see <a href="/admin/knowledge-base/platform-config-runbook">Platform Config &amp; Superadmin</a>.</li>
  <li><strong>Support Mail Ingest</strong> — <a href="/admin/knowledge-base/support-mail-ingest-runbook">how email becomes tickets</a>.</li>
</ul>
$b$,
    updated_at = NOW()
WHERE slug = 'superadmin-operate-platform-overview' AND tenant_id IS NULL
  AND body NOT LIKE '%/admin/platform-config</code>%';

-- ---------------------------------------------------------------------------
-- D2. New runbooks
-- ---------------------------------------------------------------------------

INSERT INTO public.learning_articles (category_id, title, slug, summary, body, content_format, status, audience, is_internal, published_at)
SELECT c.id, v.title, v.slug, v.summary, v.body, 'html', 'published', 'internal', true, NOW()
FROM (VALUES
('platform-config-ops', 'Control Plane Modules Runbook', 'control-plane-modules-runbook',
 'How superadmins tune marketplace modules in Platform Advanced — distance, on-demand, safety, ranking, provider AI and ads — per environment, and how to check what changed.',
$b$<p><strong>Internal runbook</strong> — not visible to customers or providers.</p>

<h2>Purpose</h2>
<p>Platform Advanced (the control plane) holds the switches and weights that shape the marketplace: search radius, on-demand requests, the panic button, ranking, provider AI budgets and ads. This runbook explains each module and how to change it safely.</p>

<h2>Who uses it</h2>
<ul>
  <li><strong>Superadmins only</strong> — every control-plane page is superadmin-only.</li>
  <li>Product and operations leads request changes; a superadmin makes them.</li>
</ul>

<h2>Pages in this section</h2>
<ul>
  <li><strong>Platform Advanced</strong> (<code>/admin/control-plane/overview</code>) <strong>[Superadmin]</strong> — overview grouped into flags, identity &amp; trust, marketplace modules, AI &amp; agents, and operations &amp; audit.</li>
  <li><strong>Distance</strong> (<code>/admin/control-plane/modules/distance</code>) <strong>[Superadmin]</strong> — radius filter and service-area defaults.</li>
  <li><strong>On-demand</strong> (<code>/admin/control-plane/modules/on-demand</code>) <strong>[Superadmin]</strong> — ringtones, request timeouts and UI copy.</li>
  <li><strong>Safety</strong> (<code>/admin/control-plane/modules/safety</code>) <strong>[Superadmin]</strong> — master switch for the panic button on booking detail.</li>
  <li><strong>Ranking</strong> (<code>/admin/control-plane/modules/ranking</code>) and <strong>Scores</strong> (<code>/admin/control-plane/modules/ranking/scores</code>) <strong>[Superadmin]</strong> — quality-scoring weights, score inspector and recompute.</li>
  <li><strong>Provider AI</strong> (<code>/admin/control-plane/modules/ai</code>) <strong>[Superadmin]</strong> — runtime budgets, limits and cache, with <strong>Usage</strong> (<code>/admin/control-plane/modules/ai/usage</code>), <strong>Entitlements</strong> (<code>/admin/control-plane/modules/ai/entitlements</code>) and <strong>Templates</strong> (<code>/admin/control-plane/modules/ai/templates</code>).</li>
  <li><strong>AI platform</strong> (<code>/admin/control-plane/integrations/ai</code>) and <strong>Agents</strong> (<code>/admin/control-plane/modules/agents</code>) <strong>[Superadmin]</strong> — model provider settings and staff agents.</li>
  <li><strong>Ads</strong> (<code>/admin/control-plane/modules/ads</code>) <strong>[Superadmin]</strong> — sponsored listings, impression packs (ZAR), time packs, billing models and campaign status.</li>
  <li><strong>Feature flag resolver</strong> (<code>/admin/control-plane/feature-flags</code>) <strong>[Superadmin]</strong> — read-only effective flag values.</li>
</ul>

<h2>Step-by-step tasks</h2>
<ol>
  <li><strong>Change a module:</strong> open the module → pick the environment (defaults to production) → edit → save → confirm the change in the config change log (<code>/admin/control-plane/audit-log</code>).</li>
  <li><strong>Re-rank after a weight change:</strong> Ranking → adjust weights → save → recompute; check individual providers on Scores (full recompute or a single provider).</li>
  <li><strong>Provider asks why AI stopped:</strong> Provider AI → Usage for their spend → Entitlements for their plan limit → raise the limit only with product approval.</li>
  <li><strong>Edit an AI prompt:</strong> Templates → create a new version for the key (with its model) rather than editing the live one.</li>
  <li><strong>Pause an ads campaign:</strong> Ads → campaigns → change status; packs and billing models stay as they are.</li>
</ol>

<h2>Managing &amp; configuration</h2>
<ul>
  <li>Each module has separate values per environment; a change in staging does not reach production.</li>
  <li>The config change log can be filtered by area: flags, integration, module and AI template.</li>
  <li>Feature flags themselves are edited in <code>/admin/settings/feature-flags</code>; the resolver here is view-only.</li>
</ul>

<h2>Common issues &amp; gotchas</h2>
<ul>
  <li>Wrong environment selected is the most common "my change did nothing" cause.</li>
  <li>Turning Safety off removes the panic button everywhere — treat it as an incident-level decision.</li>
  <li>Large ranking weight changes reshuffle search for every market at once; recompute outside peak hours.</li>
</ul>

<h2>Escalation</h2>
<p>Unexpected search or ranking behaviour after a change → revert using the config change log values and tell the product lead. AI spend spikes → CTO. Ads billing disputes → Finance.</p>

<h2>Reference for replies</h2>
<ul>
  <li><a href="/learn/article/compliance-and-safety">Compliance and safety</a></li>
  <li><a href="/learn/article/provider-web-subscription-plan">Your subscription plan</a></li>
  <li><a href="/learn/article/troubleshooting-faq-overview">Troubleshooting FAQ</a></li>
</ul>$b$),

('platform-operations-ops', 'Platform Maintenance & Audit Runbook', 'platform-maintenance-audit-runbook',
 'How to switch maintenance screens on and off per surface (public site, provider web, customer app, provider app), read maintenance sign-ups, and trace configuration changes in the config change log.',
$b$<p><strong>Internal runbook</strong> — not visible to customers or providers.</p>

<h2>Purpose</h2>
<p>Show a clear maintenance or pre-launch screen when part of the platform must be closed, keep the right paths open, and be able to prove who changed which setting and when.</p>

<h2>Who uses it</h2>
<ul>
  <li><strong>Superadmins only</strong> — Maintenance, Maintenance sign-ups and the config change log are superadmin-only.</li>
  <li>On-call engineers and the operations lead decide when maintenance is needed.</li>
</ul>

<h2>Pages in this section</h2>
<ul>
  <li><strong>Maintenance</strong> (<code>/admin/control-plane/maintenance</code>) <strong>[Superadmin]</strong> — per-scope screens: public site, provider web, customer app, provider app.</li>
  <li><strong>Maintenance sign-ups</strong> (<code>/admin/control-plane/maintenance/sign-ups</code>) <strong>[Superadmin]</strong> — emails left through the maintenance call-to-action, filterable by scope.</li>
  <li><strong>Config change log</strong> (<code>/admin/control-plane/audit-log</code>) <strong>[Superadmin]</strong> — history of flag, integration, module and AI-template changes.</li>
  <li><strong>Audit Logs</strong> (<code>/admin/audit-logs</code>) — all other admin actions.</li>
</ul>

<h2>Step-by-step tasks</h2>
<ol>
  <li><strong>Turn on maintenance:</strong> Maintenance → pick the market in the header → for each scope set enabled, title, message and optional call-to-action label and countdown → Preview → Save all.</li>
  <li><strong>Keep partners onboarding:</strong> on provider web leave "Keep onboarding &amp; checkout available" on (default) so new partners can still sign up and pay.</li>
  <li><strong>Turn it off:</strong> untick enabled for each scope → Save all → open the site in a private window to confirm.</li>
  <li><strong>Follow up sign-ups:</strong> Maintenance sign-ups → filter by scope → export to Marketing for the "we're back" message.</li>
  <li><strong>Answer "what changed?":</strong> config change log → filter by area and date → read the record key (for example <code>gemini.production</code>) and the before/after values.</li>
</ol>

<h2>Managing &amp; configuration</h2>
<ul>
  <li>Public-site maintenance never blocks sign-in, sign-up, password reset, the partner pages or pricing.</li>
  <li>Provider-web maintenance never blocks provider onboarding, embeds, subscription checkout, ads payment return or get-started.</li>
  <li>Settings are per market (tenant); check the header picker before saving.</li>
</ul>

<h2>Common issues &amp; gotchas</h2>
<ul>
  <li>Saving under the wrong market closes the wrong country.</li>
  <li>The config change log does not include user, booking or payment actions; use Audit Logs for those.</li>
</ul>

<h2>Escalation</h2>
<p>Unplanned maintenance → follow <a href="/admin/knowledge-base/incident-response-overview">Incident Response</a>. Unknown change in the log → the superadmin named on the record, then the CTO.</p>

<h2>Reference for replies</h2>
<ul>
  <li><a href="/learn/article/troubleshooting-faq-overview">Troubleshooting FAQ</a></li>
  <li><a href="/learn/article/provider-onboarding-overview">Provider onboarding overview</a></li>
</ul>$b$),

('expansion-playbook', 'Country Launch & Regions Runbook', 'country-launch-regions-runbook',
 'How a superadmin takes a new country live: market and region, domains, primary online payment gateway and secrets, currency, languages, Arabic templates and FX, all checked by the country launch checklist.',
$b$<p><strong>Internal runbook</strong> — not visible to customers or providers.</p>

<h2>Purpose</h2>
<p>Launch a country only when every dependency is in place. The country launch checklist checks each one and shows READY TO LAUNCH or NOT READY.</p>

<h2>Who uses it</h2>
<ul>
  <li><strong>Superadmins only</strong> — the checklist, region gateway, Markets and Tenant domains are superadmin-only.</li>
  <li>Finance (FX, tax) and Marketing (waitlist) supply inputs.</li>
</ul>

<h2>Pages in this section</h2>
<ul>
  <li><strong>Country launch checklist</strong> (<code>/admin/control-plane/country-launch-checklist</code>) <strong>[Superadmin]</strong> — readiness per market.</li>
  <li><strong>Region online gateway</strong> (<code>/admin/control-plane/region-online-gateway</code>) <strong>[Superadmin]</strong> — primary gateway (Paystack, Stripe or Flutterwave) and region secrets.</li>
  <li><strong>Markets</strong> (<code>/admin/settings/tenants</code>) and <strong>Tenant domains</strong> (<code>/admin/settings/tenant-domains</code>) <strong>[Superadmin]</strong>.</li>
  <li><strong>FX rates</strong> (<code>/admin/fx-rates</code>), <strong>Taxes</strong> (<code>/admin/taxes</code>), <strong>ISO codes</strong> (<code>/admin/iso-codes</code>), <strong>Notification templates</strong> (<code>/admin/notification-templates</code>).</li>
</ul>

<h2>Step-by-step tasks</h2>
<ol>
  <li>Create the market in Markets and link it to its region code; make sure the market currency matches the region.</li>
  <li>Add the production domain in Tenant domains.</li>
  <li>Region online gateway → choose the primary gateway → enter its secret (and webhook secret / publishable key for Stripe, webhook hash for Flutterwave) → save. Leave a field blank to keep the stored value.</li>
  <li>Add the currency to the catalogue, set supported languages and the languages flag, and add at least three Arabic notification templates (the checklist counts them).</li>
  <li>Add an FX rate from the market currency to ZAR so reporting works.</li>
  <li>Open the checklist → fix every failing item (gateway and secret failures link straight to the gateway page) → launch only on READY TO LAUNCH.</li>
</ol>

<h2>Managing &amp; configuration</h2>
<ul>
  <li>The settlement model is fixed: the platform is merchant of record and pays providers by transfer (Connect payouts for Stripe).</li>
  <li>Secrets are stored per region and are never shown again after saving.</li>
  <li>Service zones for the first cities: see <a href="/admin/knowledge-base/expansion-playbook-overview">Expansion Playbook</a>.</li>
</ul>

<h2>Common issues &amp; gotchas</h2>
<ul>
  <li>An inactive market or a region with no linked row fails the checklist even if everything else is set.</li>
  <li>Only production domains count; a staging domain does not satisfy the check.</li>
  <li>Without an FX rate the market's revenue is missing from ZAR reports.</li>
</ul>

<h2>Escalation</h2>
<p>Gateway onboarding problems → the payment provider's account manager through the integrations owner. Tax registration questions → Finance lead. Launch date → Marketing.</p>

<h2>Reference for replies</h2>
<ul>
  <li><a href="/learn/article/payments-customer-overview">Payments overview</a></li>
  <li><a href="/learn/article/provider-onboarding-overview">Provider onboarding overview</a></li>
  <li><a href="/learn/article/policies-overview">Policies overview</a></li>
</ul>$b$),

('platform-config-ops', 'Compliance Purge & Tenant Reset Runbook', 'compliance-purge-reset-runbook',
 'How a superadmin permanently erases a user or provider organisation for a verified DSAR or legal request, and how a market''s transactional data is reset — with the exact confirmations and audit trail each needs.',
$b$<p><strong>Internal runbook</strong> — not visible to customers or providers.</p>

<h2>Purpose</h2>
<p>Carry out verified erasure requests and test-market resets without collateral damage. Every action here is irreversible and is written to an immutable compliance audit log.</p>

<h2>Who uses it</h2>
<ul>
  <li><strong>Superadmins only</strong> — the pages and their APIs refuse every other role.</li>
  <li>The Compliance lead approves each erasure; GRC keeps the evidence.</li>
</ul>

<h2>Pages in this section</h2>
<ul>
  <li><strong>Compliance purge</strong> (<code>/admin/control-plane/compliance</code>) <strong>[Superadmin]</strong> — look up a user or provider, preview impact, purge, and read the purge audit list.</li>
  <li><strong>Tenant reset</strong> (<code>/admin/control-plane/tenant-reset</code>) <strong>[Superadmin]</strong> — delete one market's transactional data.</li>
  <li><strong>GRC Privacy</strong> (<code>/admin/grc/privacy</code>) and <strong>Evidence</strong> (<code>/admin/grc/evidence</code>) — record the request and its proof.</li>
</ul>

<h2>Step-by-step tasks</h2>
<ol>
  <li><strong>Before anything:</strong> confirm the requester's identity and get Compliance lead approval in writing.</li>
  <li><strong>Purge a user:</strong> look up the user → Preview impact (dry run) → enter a reason of at least 20 characters, type the account email, type <code>DELETE USER FOREVER</code>, tick the irreversible acknowledgement → purge.</li>
  <li><strong>Purge a provider organisation:</strong> look up the provider → preview → reason, the business / billing / owner email, <code>PURGE PROVIDER ORG</code>, acknowledgement → purge. The owner and staff logins are removed too.</li>
  <li><strong>Reset a market:</strong> Tenant reset → choose the market → type its slug, a reason of at least 20 characters and <code>RESET TENANT TRANSACTIONS</code> → run a dry run first → then run live.</li>
  <li>Attach the audit entry to the GRC privacy record.</li>
</ol>

<h2>Managing &amp; configuration</h2>
<ul>
  <li>A tenant reset deletes bookings, payments, orders, ledger and journal rows, reviews, conversations, tickets, notifications, payouts, invoices and related history for that market, then recomputes provider stats and wallet balances.</li>
  <li>It keeps users, providers, services, products and configuration.</li>
  <li>Each purge writes an audit report with a redacted snapshot, marked for deletion after the retention period (5 years by default).</li>
</ul>

<h2>Common issues &amp; gotchas</h2>
<ul>
  <li>You cannot purge yourself or another superadmin, and providers owned by a superadmin are refused.</li>
  <li>The default ZA market is blocked from reset unless the explicit default-market override is ticked — never use it on production data.</li>
  <li>If a purge fails, the error lists the records still pointing at the user; resolve those (often with engineering) and retry.</li>
  <li>The market picker in the header limits lookups to that market.</li>
</ul>

<h2>Escalation</h2>
<p>Any doubt about the legal basis → Compliance lead before acting. Failed purge after retry → CTO. Accidental reset → CTO immediately.</p>

<h2>Reference for replies</h2>
<ul>
  <li><a href="/learn/article/security-privacy-overview">Security and privacy</a></li>
  <li><a href="/learn/article/account-profile-overview">Account and profile</a></li>
  <li><a href="/learn/article/policies-overview">Policies overview</a></li>
</ul>$b$),

('finance-payouts-ops', 'Money Path: Refunds & VAT Runbook', 'money-path-refunds-vat-runbook',
 'Where refund money goes (always the customer wallet), how wallet-to-bank cash-outs and automatic stale-payment refunds work, and how VAT and tax rates are resolved and reversed.',
$b$<p><strong>Internal runbook</strong> — not visible to customers or providers.</p>

<h2>Purpose</h2>
<p>Explain the money path after a payment so Finance and Support give the same answer: refunds credit the wallet, cash-outs are a separate request, late charges are refunded automatically, and tax follows the resolved rate.</p>

<h2>Who uses it</h2>
<ul>
  <li><strong>Finance</strong> (Finance section: superadmin, admin_finance) — Refunds, Refund Anomalies, Taxes, Reconciliation.</li>
  <li><strong>Support / Operations</strong> — dispute refunds and customer questions.</li>
</ul>

<h2>Pages in this section</h2>
<ul>
  <li><strong>Refunds</strong> (<code>/admin/refunds</code>) — Booking refunds tab and <strong>Wallet → bank</strong> tab.</li>
  <li><strong>Refund Anomalies</strong> (<code>/admin/refund-anomalies</code>) — provider refund-abuse and in-person-payment signals, plus paid custom offers to recover.</li>
  <li><strong>Disputes</strong> (<code>/admin/disputes</code>) — refund full, refund partial or deny.</li>
  <li><strong>Taxes</strong> (<code>/admin/taxes</code>) — platform tax rates.</li>
  <li><strong>Reconciliation exceptions</strong> (<code>/admin/reconciliation-exceptions</code>) <strong>[Superadmin]</strong> — charges that need review.</li>
  <li><strong>Period locks</strong> (<code>/admin/period-locks</code>).</li>
</ul>

<h2>Step-by-step tasks</h2>
<ol>
  <li><strong>Admin refund:</strong> from Disputes or Refunds — the system checks the period lock, records the refund, credits the wallet, updates the payment, restores gift-card value, notifies the customer and writes the audit log.</li>
  <li><strong>Wallet → bank request:</strong> Refunds → Wallet → bank → open the request → reveal the account number if needed → approve → send the EFT → mark paid with the transfer reference. Or reject with a reason, which re-credits the held amount to the wallet.</li>
  <li><strong>Charge landed after the booking or offer closed:</strong> the platform refunds it automatically through the gateway (stale-payment refund, retried up to 5 times). A refund that still fails stays failed and needs Finance follow-up.</li>
  <li><strong>Paid custom offer that was never delivered:</strong> Refund Anomalies → recover.</li>
</ol>

<h2>Managing &amp; configuration</h2>
<ul>
  <li>Wallet → bank settings: enabled, minimum, maximum and fee.</li>
  <li>South Africa uses a 15% VAT-inclusive standard rate. A provider's own rate overrides the platform rate for that country; the country comes from the market's region code.</li>
  <li>Refunds reverse every component proportionally — service, fees, tax and held VAT.</li>
  <li>Provider VAT in payouts (<code>finance.provider_vat_payout</code>) and the new provider VAT settings (<code>tax.provider_vat_settings_v2</code>) are feature flags; check Feature Flags before answering VAT payout questions.</li>
  <li>Provider staff need the <em>issue refunds</em> permission (owner and manager by default) to refund from the provider side.</li>
</ul>

<h2>Common issues &amp; gotchas</h2>
<ul>
  <li>Cancelling a booking without changing amounts never trips the booking money checks; a save that changes amounts and fails is usually a fee mismatch — escalate to Finance.</li>
  <li>The online-charge reconcile job runs every 15 minutes; give a new payment that long before calling it missing.</li>
  <li>Bank refunds hold the amount when the customer submits; the wallet balance looks lower until the request is paid or rejected.</li>
</ul>

<h2>Escalation</h2>
<p>Ledger mismatch or a refund that will not post → Finance lead. Reconciliation exceptions older than 24 hours → Finance lead (a Slack alert also fires). Tax-rate disputes from providers → Finance with the provider's VAT number.</p>

<h2>Reference for replies</h2>
<ul>
  <li><a href="/learn/article/refunds-and-cancellation-fees">Refunds and cancellation fees</a></li>
  <li><a href="/learn/article/wallet-gift-cards-coupons-overview">Wallet, gift cards and coupons</a></li>
  <li><a href="/learn/article/payments-customer-overview">Payments overview</a></li>
  <li><a href="/learn/article/understanding-earnings">Understanding earnings</a></li>
</ul>$b$),

('security-compliance-ops', 'Admin Security, MFA & Sessions Runbook', 'admin-security-mfa-sessions-runbook',
 'How admin two-step verification is enforced, how provider session protection and the admin IP allowlist work, and how to sign a user out everywhere or reset their 2FA safely.',
$b$<p><strong>Internal runbook</strong> — not visible to customers or providers.</p>

<h2>Purpose</h2>
<p>Keep admin and provider accounts safe: every admin uses two-step verification, risky provider actions need step-up or device checks, and staff know exactly how to lock down a compromised account.</p>

<h2>Who uses it</h2>
<ul>
  <li><strong>Operations / security leads</strong> (Operations section) — Security Policy.</li>
  <li><strong>Trust &amp; Safety</strong> (Users &amp; trust section) — Sign out everywhere.</li>
  <li><strong>Superadmins</strong> — Reset 2FA and impersonation.</li>
</ul>

<h2>Pages in this section</h2>
<ul>
  <li><strong>Security Policy</strong> (<code>/admin/security</code>) — admin 2FA, provider session protection, login rate limiting, data retention, admin IP allowlist.</li>
  <li><strong>Account security</strong> panel on <code>/admin/users/:id</code> — 2FA status, trusted devices, recent security events and actions.</li>
  <li><strong>MFA enrolment</strong> (<code>/admin/mfa/enroll</code>) — where unenrolled admins are sent.</li>
  <li><strong>Audit Logs</strong> (<code>/admin/audit-logs</code>) — every action below is recorded.</li>
</ul>

<h2>Step-by-step tasks</h2>
<ol>
  <li><strong>Compromised account:</strong> user detail → Sign out everywhere → give a reason. Sessions end and devices are forgotten; the user gets an "account secured" notice. Existing access tokens can last up to an hour.</li>
  <li><strong>Lost phone (2FA):</strong> verify identity first → (superadmin) Reset 2FA with the verification reason → factors, recovery codes, devices and sessions are removed and the user is notified. You cannot reset your own 2FA.</li>
  <li><strong>Reproduce a user issue:</strong> (superadmin) Impersonate with a reason; limited to 5 per hour and fully audited.</li>
  <li><strong>New admin locked out:</strong> they must finish enrolment at <code>/admin/mfa/enroll</code>; for a lost admin factor follow the admin MFA break-glass procedure (<code>docs/ADMIN_MFA_BREAK_GLASS.md</code>).</li>
</ol>

<h2>Managing &amp; configuration</h2>
<ul>
  <li>Admin 2FA applies to all admin roles; admins without a verified second factor cannot call admin APIs after the enforcement date.</li>
  <li>Provider session protection: step-up and device verification each run off, monitor or enforce; step-up window 60–3600 seconds (default 600); trusted devices 180 days; limited trust 24 hours.</li>
  <li>Admin IP allowlist holds up to 200 entries and refuses a change that would lock you out.</li>
  <li>New payout bank accounts are held for 48 hours by default (General Settings).</li>
</ul>

<h2>Common issues &amp; gotchas</h2>
<ul>
  <li>Switching provider protection straight to enforce can block providers mid-shift; run monitor first and watch security events.</li>
  <li>Security emails (device code, step-up code, new device, password or payout account changes) come from notification templates — a missing template means no email.</li>
  <li>"Sign out everywhere" does not reset 2FA; a stolen authenticator needs both.</li>
</ul>

<h2>Escalation</h2>
<p>Suspected admin account compromise → CTO and GRC immediately, then <a href="/admin/knowledge-base/incident-response-overview">Incident Response</a>. Provider takeover with payout changes → Finance to hold payouts.</p>

<h2>Reference for replies</h2>
<ul>
  <li><a href="/learn/article/security-privacy-overview">Security and privacy</a></li>
  <li><a href="/learn/article/account-profile-overview">Account and profile</a></li>
  <li><a href="/learn/article/request-payout">Requesting a payout</a></li>
</ul>$b$),

('support-desk-ops', 'Support Mail Ingest Runbook', 'support-mail-ingest-runbook',
 'How emails to the support mailbox become tickets through Zoho Mail — sync every two minutes, threading, auto-acknowledgements, quarantine — and the first-response and resolution SLAs that apply.',
$b$<p><strong>Internal runbook</strong> — not visible to customers or providers.</p>

<h2>Purpose</h2>
<p>Make sure every email to support becomes exactly one ticket in the right market, gets an acknowledgement, and is answered within SLA.</p>

<h2>Who uses it</h2>
<ul>
  <li><strong>Support agents and leads</strong> (Support section: superadmin, support_agent, admin_support) — tickets.</li>
  <li><strong>Integrations admins</strong> (Integrations &amp; dev section: superadmin, admin_integrations) — the Zoho Mail page.</li>
</ul>

<h2>Pages in this section</h2>
<ul>
  <li><strong>Support Tickets</strong> (<code>/admin/support-tickets</code>) — email tickets show channel <em>email</em> and the requester's address.</li>
  <li><strong>AI drafts</strong> (<code>/admin/support-tickets/ai-drafts</code>) — suggested replies to review.</li>
  <li><strong>Zoho Mail</strong> (<code>/admin/integrations/zoho-mail</code>) — connection, Sync now, mailbox settings, Test connection and the quarantine.</li>
</ul>

<h2>Step-by-step tasks</h2>
<ol>
  <li><strong>Normal flow:</strong> mail is fetched every 2 minutes (and on Zoho webhooks). A reply joins its existing ticket by thread, then by message ID, then by the ticket number in the subject; otherwise a new ticket opens as medium priority with an SLA.</li>
  <li><strong>Customer says "I emailed but got nothing":</strong> search tickets by email → if missing, open Zoho Mail → Quarantine → find the message → create a ticket from it.</li>
  <li><strong>Mail stopped arriving:</strong> Zoho Mail → Test connection → Sync now → reconnect if the token expired.</li>
  <li><strong>Spam sender:</strong> add the address to the mailbox's blocked senders.</li>
</ol>

<h2>Managing &amp; configuration</h2>
<ul>
  <li>Mailbox settings: inbound, outbound and acknowledgement on/off, acknowledgement subject and body (default subject "We received your request [ticket number]"), default category, lookback hours (max 168) and blocked senders.</li>
  <li>Acknowledgements are limited to one per sender per hour.</li>
  <li>SLA first response: urgent 30 minutes, high 2 hours, medium 8 hours, low 24 hours. Resolution: urgent 4 hours, high 24 hours, medium 72 hours, low 7 days. If the AI assistant handled the ticket first, the first-response clock starts at hand-off.</li>
  <li>Tickets get a market automatically (provider's market, else the user's home market, else ZA); agents see the markets they are assigned.</li>
</ul>

<h2>Common issues &amp; gotchas</h2>
<ul>
  <li>Messages are skipped and quarantined when they come from our own mailbox, cannot be routed, come from a blocked sender, or are auto-replies.</li>
  <li>Replies thread by Zoho thread and message ID first, so an edited subject usually still threads; the ticket number in the subject is only the fallback.</li>
  <li>Attachments arrive with the ticket; do not ask the customer to resend unless the quarantine shows it was skipped.</li>
</ul>

<h2>Escalation</h2>
<p>Mailbox disconnected or Test connection failing → Integrations owner. SLA breaches piling up → Support lead. Legal or press emails → Support lead the same day.</p>

<h2>Reference for replies</h2>
<ul>
  <li><a href="/learn/article/support-tickets-disputes-overview">Support tickets and disputes</a></li>
  <li><a href="/learn/article/troubleshooting-faq-overview">Troubleshooting FAQ</a></li>
</ul>$b$),

('finance-payouts-ops', 'Payroll Ops Runbook', 'payroll-ops-runbook',
 'How payroll rule sets (PAYE, UIF, SDL, minimum wage) are verified and published, how the payroll v2 switch works for providers, and how clawbacks and carry-forwards show on pay runs.',
$b$<p><strong>Internal runbook</strong> — not visible to customers or providers.</p>

<h2>Purpose</h2>
<p>Keep provider staff payroll calculations correct: statutory rule sets are current, verified by two people, and providers know how commission, clawbacks and carry-forwards appear on their pay runs.</p>

<h2>Who uses it</h2>
<ul>
  <li><strong>Finance</strong> (Finance section: superadmin, admin_finance) — Payroll rule sets.</li>
  <li><strong>Support</strong> — provider payroll questions.</li>
</ul>

<h2>Pages in this section</h2>
<ul>
  <li><strong>Payroll rule sets</strong> (<code>/admin/payroll-rules</code>) — rule sets by country and tax year, golden tests, health cards.</li>
  <li><strong>Feature Flags</strong> (<code>/admin/settings/feature-flags</code>) — the <code>payroll.v2</code> platform switch.</li>
  <li><strong>Providers</strong> (<code>/admin/providers/:id</code>) — a provider's own payroll setup.</li>
</ul>

<h2>Step-by-step tasks</h2>
<ol>
  <li><strong>New tax year:</strong> create or import the set → Verify (runs the golden tests) → a second, different admin verifies → publish.</li>
  <li><strong>Check health:</strong> read the cards for providers on v2, staff on manual statutory deductions, and published sets past their end date — fix any set past end date first.</li>
  <li><strong>Provider asks why PAYE is not deducted:</strong> confirm <code>payroll.v2</code> is on and the provider's own payroll v2 setting is enabled; staff on manual statutory deductions are skipped by design.</li>
</ol>

<h2>Managing &amp; configuration</h2>
<ul>
  <li>The ZA 2027 tax year set takes effect from 1 March 2026, with UIF at 1% capped at R17,712 per month and SDL at 1% above the R500,000 payroll threshold.</li>
  <li><code>payroll.v2</code> is on platform-wide and providers default to enabled; each provider can still turn it off.</li>
  <li>Pay-run lines show commission clawbacks and amounts carried forward in and out.</li>
</ul>

<h2>Common issues &amp; gotchas</h2>
<ul>
  <li>The same admin cannot verify a set twice — publishing waits for a second person.</li>
  <li>A commission clawback line on a pay run is expected when earlier commission is reversed; it is not an error.</li>
  <li>A published set past its end date shows on the health cards — replace it before the next pay runs.</li>
</ul>

<h2>Escalation</h2>
<p>Golden tests failing on a set → Finance lead before publishing. Statutory rate questions → Finance lead with SARS references. Calculation bugs on a pay run → engineering through Finance.</p>

<h2>Reference for replies</h2>
<ul>
  <li><a href="/learn/article/provider-commissions-payroll">Commissions and payroll</a></li>
  <li><a href="/learn/article/understanding-earnings">Understanding earnings</a></li>
  <li><a href="/learn/article/payouts-earnings-overview">Payouts and earnings</a></li>
</ul>$b$)
) AS v(category_slug, title, slug, summary, body)
JOIN public.learning_categories c ON c.slug = v.category_slug AND c.tenant_id IS NULL
ON CONFLICT (slug) WHERE tenant_id IS NULL DO UPDATE SET
  category_id = EXCLUDED.category_id,
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  body = EXCLUDED.body,
  content_format = 'html',
  status = 'published',
  audience = 'internal',
  is_internal = true,
  updated_at = NOW();

INSERT INTO public.learning_article_stats (article_id, view_count, helpful_yes_count, helpful_no_count)
SELECT a.id, 0, 0, 0
FROM public.learning_articles a
WHERE a.tenant_id IS NULL
  AND a.slug IN (
    'control-plane-modules-runbook',
    'platform-maintenance-audit-runbook',
    'country-launch-regions-runbook',
    'compliance-purge-reset-runbook',
    'money-path-refunds-vat-runbook',
    'admin-security-mfa-sessions-runbook',
    'support-mail-ingest-runbook',
    'payroll-ops-runbook'
  )
ON CONFLICT (article_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- E. Master overview links every new runbook
-- ---------------------------------------------------------------------------

UPDATE public.learning_articles
SET body = body || $b$
<h2>Specialist runbooks</h2>
<ul>
  <li><a href="/admin/knowledge-base/control-plane-modules-runbook">Control Plane Modules</a> — distance, on-demand, safety, ranking, provider AI, ads.</li>
  <li><a href="/admin/knowledge-base/platform-maintenance-audit-runbook">Platform Maintenance &amp; Audit</a> — maintenance screens, sign-ups, config change log.</li>
  <li><a href="/admin/knowledge-base/country-launch-regions-runbook">Country Launch &amp; Regions</a> — launch checklist and region gateways.</li>
  <li><a href="/admin/knowledge-base/compliance-purge-reset-runbook">Compliance Purge &amp; Tenant Reset</a> — erasure and market resets.</li>
  <li><a href="/admin/knowledge-base/money-path-refunds-vat-runbook">Money Path: Refunds &amp; VAT</a> — wallet refunds, bank cash-outs, VAT.</li>
  <li><a href="/admin/knowledge-base/admin-security-mfa-sessions-runbook">Admin Security, MFA &amp; Sessions</a> — 2FA, session protection, lockdown.</li>
  <li><a href="/admin/knowledge-base/support-mail-ingest-runbook">Support Mail Ingest</a> — Zoho mail to tickets, SLAs.</li>
  <li><a href="/admin/knowledge-base/payroll-ops-runbook">Payroll Ops</a> — rule sets, payroll v2, pay runs.</li>
</ul>
$b$,
    updated_at = NOW()
WHERE slug = 'superadmin-operate-platform-overview' AND tenant_id IS NULL
  AND body NOT LIKE '%/admin/knowledge-base/control-plane-modules-runbook%';

-- ---------------------------------------------------------------------------
-- F. Training paths
-- ---------------------------------------------------------------------------

-- Replace the legacy-vendor distractor in the trust-safety-reviewer quiz; choice order is unchanged so answer_index stays valid.
UPDATE public.learning_training_paths
SET checkpoint_quiz = regexp_replace(checkpoint_quiz::text, '/admin/control-plane/integrations/s[u]msub', '/admin/identity-trust/sessions', 'g')::jsonb,
    updated_at = NOW()
WHERE checkpoint_quiz::text ~* 's[u]msub';

WITH targets(path_slug, ord, article_slug) AS (VALUES
  ('superadmin-full-platform',     1, 'control-plane-modules-runbook'),
  ('superadmin-full-platform',     2, 'platform-maintenance-audit-runbook'),
  ('superadmin-full-platform',     3, 'country-launch-regions-runbook'),
  ('superadmin-full-platform',     4, 'compliance-purge-reset-runbook'),
  ('superadmin-full-platform',     5, 'money-path-refunds-vat-runbook'),
  ('superadmin-full-platform',     6, 'admin-security-mfa-sessions-runbook'),
  ('superadmin-full-platform',     7, 'support-mail-ingest-runbook'),
  ('superadmin-full-platform',     8, 'payroll-ops-runbook'),
  ('finance-payouts-operator',     1, 'money-path-refunds-vat-runbook'),
  ('finance-payouts-operator',     2, 'payroll-ops-runbook'),
  ('new-support-agent',            1, 'support-mail-ingest-runbook'),
  ('trust-safety-reviewer',        1, 'compliance-purge-reset-runbook'),
  ('security-compliance-operator', 1, 'admin-security-mfa-sessions-runbook'),
  ('security-compliance-operator', 2, 'compliance-purge-reset-runbook')
),
missing AS (
  SELECT t.path_slug, array_agg(t.article_slug ORDER BY t.ord) AS slugs
  FROM targets t
  JOIN public.learning_training_paths p ON p.slug = t.path_slug
  WHERE NOT (t.article_slug = ANY(COALESCE(p.article_slugs, '{}'::text[])))
  GROUP BY t.path_slug
)
UPDATE public.learning_training_paths p
SET article_slugs = COALESCE(p.article_slugs, '{}'::text[]) || m.slugs,
    updated_at = NOW()
FROM missing m
WHERE p.slug = m.path_slug;

WITH questions(ord, qid, item) AS (VALUES
  (1, 'q-cp-modules', '{"id":"q-cp-modules","prompt":"Where do you tune provider quality-scoring weights and recompute ranking scores?","choices":["/admin/control-plane/modules/ranking","/admin/reviews","/admin/provider-ops/reports"],"answer_index":0}'::jsonb),
  (2, 'q-maintenance-audit', '{"id":"q-maintenance-audit","prompt":"Which page shows the history of flag, integration, module and AI-template changes?","choices":["/admin/control-plane/audit-log","/admin/cron-runs","/admin/webhooks/inbound"],"answer_index":0}'::jsonb),
  (3, 'q-country-launch', '{"id":"q-country-launch","prompt":"Which page tells you whether a new market is READY TO LAUNCH (domains, gateway, secrets, currency, FX)?","choices":["/admin/control-plane/country-launch-checklist","/admin/service-zones","/admin/settings/tenant-domains"],"answer_index":0}'::jsonb),
  (4, 'q-compliance-purge', '{"id":"q-compliance-purge","prompt":"Besides the reason and the typed account email, which phrase must be typed to purge a user?","choices":["DELETE USER FOREVER","PURGE PROVIDER ORG","RESET TENANT TRANSACTIONS"],"answer_index":0}'::jsonb),
  (5, 'q-money-path', '{"id":"q-money-path","prompt":"Where does an admin refund from Disputes or Refunds go?","choices":["The customer''s Beautonomi wallet","Straight back to the customer''s card","The provider''s bank account"],"answer_index":0}'::jsonb),
  (6, 'q-admin-security', '{"id":"q-admin-security","prompt":"Who can reset another user''s two-step verification from the user detail page?","choices":["Superadmins only","Any admin with Users & trust access","The provider''s owner"],"answer_index":0}'::jsonb),
  (7, 'q-support-mail', '{"id":"q-support-mail","prompt":"What is the first-response SLA for a medium-priority ticket?","choices":["8 hours","30 minutes","72 hours"],"answer_index":0}'::jsonb),
  (8, 'q-payroll', '{"id":"q-payroll","prompt":"How many different admins must verify a payroll rule set before it can be published?","choices":["Two","One","None, sets publish automatically"],"answer_index":0}'::jsonb)
),
targets(path_slug, qid) AS (VALUES
  ('superadmin-full-platform',     'q-cp-modules'),
  ('superadmin-full-platform',     'q-maintenance-audit'),
  ('superadmin-full-platform',     'q-country-launch'),
  ('superadmin-full-platform',     'q-compliance-purge'),
  ('superadmin-full-platform',     'q-money-path'),
  ('superadmin-full-platform',     'q-admin-security'),
  ('superadmin-full-platform',     'q-support-mail'),
  ('superadmin-full-platform',     'q-payroll'),
  ('finance-payouts-operator',     'q-money-path'),
  ('finance-payouts-operator',     'q-payroll'),
  ('new-support-agent',            'q-support-mail'),
  ('trust-safety-reviewer',        'q-compliance-purge'),
  ('security-compliance-operator', 'q-admin-security'),
  ('security-compliance-operator', 'q-compliance-purge')
),
missing AS (
  SELECT t.path_slug, jsonb_agg(q.item ORDER BY q.ord) AS items
  FROM targets t
  JOIN questions q ON q.qid = t.qid
  JOIN public.learning_training_paths p ON p.slug = t.path_slug
  WHERE NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(p.checkpoint_quiz, '[]'::jsonb)) e
    WHERE e->>'id' = t.qid
  )
  GROUP BY t.path_slug
)
UPDATE public.learning_training_paths p
SET checkpoint_quiz = COALESCE(p.checkpoint_quiz, '[]'::jsonb) || m.items,
    updated_at = NOW()
FROM missing m
WHERE p.slug = m.path_slug;
