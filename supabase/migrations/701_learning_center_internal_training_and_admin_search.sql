-- 701_learning_center_internal_training_and_admin_search.sql
-- 1) Enrich the 6 internal-ops training articles (is_internal = true) into structured,
--    enterprise-grade runbooks the support/ops team can learn from and reference.
-- 2) Add an admin full-text search RPC that INCLUDES internal + audience-aware results,
--    so the support desk can find and link any learning article (public or internal).
-- Idempotent: full-body SET by slug; CREATE OR REPLACE FUNCTION.

-- ═══════════════════════════════════════════════════════════════════════════════
-- INTERNAL TRAINING ARTICLES
-- ═══════════════════════════════════════════════════════════════════════════════

UPDATE public.learning_articles SET summary = 'Internal runbook: how the support and trust team moderates content, handles safety reports, and escalates.', body = $body$<p>This internal runbook guides the trust &amp; safety and support teams when moderating content and responding to safety reports. It is not visible to customers or providers.</p>
<h2>Purpose</h2>
<p>Keep the marketplace safe and compliant: review flagged listings, reviews, messages, and profiles; act on safety reports quickly; and document every decision for auditability.</p>
<h2>Daily workflow</h2>
<ol>
  <li>Open the moderation queue in the admin SPA and sort by severity, then age.</li>
  <li>Review the reported entity (listing, review, message, profile) against community standards.</li>
  <li>Take action: approve, hide, edit-request, suspend, or escalate to Trust lead.</li>
  <li>Record the rationale in the case notes — decisions must be reconstructable later.</li>
</ol>
<h2>Escalation &amp; SLA</h2>
<ul>
  <li><strong>Imminent safety risk:</strong> escalate immediately to the Trust lead and follow the incident response runbook.</li>
  <li><strong>Standard reports:</strong> first action within the support SLA tier for the report priority.</li>
  <li><strong>Legal or regulator contact:</strong> route to Compliance; do not respond directly.</li>
</ul>
<h2>Reference for customer replies</h2>
<p>When responding to a reporter, link the public article <a href="/learn/article/policies-overview">Policies Overview</a> and, for safety on house calls, <a href="/learn/article/at-home-services-overview">At-Home Services</a>.</p>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'moderation-safety-ops-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET summary = 'Internal runbook: reviewing provider identity and business verification submissions.', body = $body$<p>This internal runbook covers how the verification team reviews provider identity and business submissions before a provider can transact.</p>
<h2>Purpose</h2>
<p>Confirm providers are who they claim to be and are eligible to operate, while protecting submitted documents and meeting turnaround expectations.</p>
<h2>Review workflow</h2>
<ol>
  <li>Open the verification queue and pick the oldest pending submission within your tier.</li>
  <li>Check identity documents for legibility, validity, and match to the account name.</li>
  <li>Check business details (registration, banking name match for payouts) where required.</li>
  <li>Approve, request more information, or decline with a clear reason code.</li>
</ol>
<h2>Handling &amp; privacy</h2>
<ul>
  <li>Verification documents are confidential — never share them with customers or other providers.</li>
  <li>Store decisions and reason codes so verification status changes are auditable.</li>
  <li>If documents look fraudulent, escalate to Trust before declining.</li>
</ul>
<h2>Reference for provider replies</h2>
<p>Point providers to <a href="/learn/article/verification-steps">Verification steps</a> and <a href="/learn/article/setup-status-checklist">Setup status and checklist</a> when asking for resubmission.</p>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'verification-ops-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET summary = 'Internal runbook: resolving disputes and processing refunds fairly and consistently.', body = $body$<p>This internal runbook guides the support team through disputes and refunds so outcomes are fair, consistent, and policy-aligned.</p>
<h2>Purpose</h2>
<p>Resolve customer/provider disputes about service quality, no-shows, cancellations, and charges, and process refunds correctly through the original payment path.</p>
<h2>Resolution workflow</h2>
<ol>
  <li>Gather context from the booking, payment record, and message thread.</li>
  <li>Apply the cancellation/refund policy and the provider's stated policy for the booking.</li>
  <li>Decide: full refund, partial refund, credit to wallet, or decline with explanation.</li>
  <li>Process the refund via the original Paystack payment or wallet, and note the decision.</li>
</ol>
<h2>Key facts</h2>
<ul>
  <li>Online payments run through Paystack; refunds return to the original card or wallet.</li>
  <li>In-person Yoco/cash was never held by the platform — those are settled with the provider directly, not via platform refund.</li>
  <li>Provider-initiated cancellations entitle the customer to a full refund.</li>
</ul>
<h2>Reference for customer replies</h2>
<p>Link <a href="/learn/article/canceling-your-booking">Canceling your booking</a>, <a href="/learn/article/refunds-and-cancellation-fees">Refunds and cancellation fees</a>, and <a href="/learn/article/if-provider-cancels">If your provider cancels</a>.</p>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'disputes-refund-ops-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET summary = 'Internal playbook: launching and managing service zones and regional expansion.', body = $body$<p>This internal playbook helps the operations team launch new service zones and manage regional expansion.</p>
<h2>Purpose</h2>
<p>Open new areas in a controlled way so supply (providers), demand (customers), and operational support are aligned before and after launch.</p>
<h2>Launch workflow</h2>
<ol>
  <li>Validate demand signals and competitor presence for the target area.</li>
  <li>Confirm provider supply: recruit and verify enough providers and configure service zones (Mapbox) and travel fees.</li>
  <li>Set regional configuration: currency, fees, and any region-specific policies.</li>
  <li>Soft-launch, monitor booking funnel and support volume, then scale marketing.</li>
</ol>
<h2>Post-launch monitoring</h2>
<ul>
  <li>Track first-booking conversion, provider activation, and cancellation rate.</li>
  <li>Watch support ticket categories for onboarding or payment friction.</li>
  <li>Adjust travel fees and zones based on real routing outcomes.</li>
</ul>
<h2>Reference</h2>
<p>Provider-facing context: <a href="/learn/article/locations-service-areas-overview">Locations &amp; Service Areas</a> and <a href="/learn/article/provider-onboarding-overview">Provider Onboarding</a>.</p>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'expansion-playbook-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET summary = 'Internal runbook: detecting, triaging, and responding to platform incidents.', body = $body$<p>This internal runbook defines how the team detects, triages, and responds to platform incidents affecting bookings, payments, or availability.</p>
<h2>Purpose</h2>
<p>Restore service quickly, communicate clearly, and learn from every incident through a blameless post-mortem.</p>
<h2>Response workflow</h2>
<ol>
  <li><strong>Detect:</strong> from monitoring alerts, Slack triggers, or a spike in support tickets.</li>
  <li><strong>Declare:</strong> assign an incident lead and a severity level.</li>
  <li><strong>Mitigate:</strong> stop the bleeding (rollback, feature flag, failover) before root-causing.</li>
  <li><strong>Communicate:</strong> update internal channels and, if customer-facing, prepare support messaging.</li>
  <li><strong>Resolve &amp; review:</strong> confirm recovery, then run a post-mortem with action items.</li>
</ol>
<h2>Severity guide</h2>
<ul>
  <li><strong>Sev1:</strong> payments or bookings down platform-wide — all hands, immediate comms.</li>
  <li><strong>Sev2:</strong> major feature degraded for a region or segment.</li>
  <li><strong>Sev3:</strong> minor or cosmetic; fix in normal flow.</li>
</ul>
<h2>Reference for customer replies</h2>
<p>During customer-facing incidents, use <a href="/learn/article/troubleshooting-faq-overview">Troubleshooting &amp; FAQ</a> for known workarounds.</p>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'incident-response-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET summary = 'Internal runbook: provider subscription billing, platform fees, and payout configuration.', body = $body$<p>This internal runbook covers billing operations: provider subscription plans, platform fee configuration, and payout settings.</p>
<h2>Purpose</h2>
<p>Keep provider billing and platform economics correct: subscription plans (Paystack plan codes), platform fees, and payout behaviour.</p>
<h2>Billing workflow</h2>
<ol>
  <li>Confirm the provider's subscription plan and renewal status before billing changes.</li>
  <li>For fee questions, check the configured platform fee for the booking/order type and region.</li>
  <li>For payout issues, confirm a verified bank account and that funds were platform-held (Paystack), not in-person Yoco/cash.</li>
  <li>Document any manual adjustment with reason and approver.</li>
</ol>
<h2>Key facts</h2>
<ul>
  <li>Provider subscriptions use Paystack plan codes — distinct from customer-facing membership products providers sell.</li>
  <li>Only platform-held (Paystack) revenue contributes to the withdrawable payout balance.</li>
  <li>Refunds and platform fees reduce net earnings shown in provider finance.</li>
</ul>
<h2>Reference for provider replies</h2>
<p>Link <a href="/learn/article/pricing-subscriptions-overview">Pricing &amp; Subscriptions</a>, <a href="/learn/article/understanding-earnings">Understanding your earnings</a>, and <a href="/learn/article/request-payout">How to request a payout</a>.</p>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'billing-ops-overview' AND tenant_id IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- ADMIN SEARCH RPC (includes internal + audience-aware) for the support desk
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.search_learning_articles_admin(
  p_query text DEFAULT NULL,
  p_limit int DEFAULT 20,
  p_offset int DEFAULT 0,
  p_audience text DEFAULT NULL,
  p_include_internal boolean DEFAULT true
)
RETURNS TABLE (
  id uuid,
  category_id uuid,
  title text,
  slug text,
  summary text,
  audience text,
  is_internal boolean,
  status text,
  published_at timestamptz,
  rank real,
  content_type text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.id,
    a.category_id,
    a.title,
    a.slug,
    a.summary,
    a.audience,
    a.is_internal,
    a.status,
    a.published_at,
    CASE
      WHEN p_query IS NULL OR length(btrim(p_query)) = 0 THEN 0::real
      ELSE ts_rank(a.search_vector, plainto_tsquery('english', p_query))
    END AS rank,
    COALESCE(a.content_type, 'article')::text AS content_type
  FROM learning_articles a
  WHERE a.status = 'published'
    AND (p_include_internal OR a.is_internal = false)
    AND (a.published_at IS NULL OR a.published_at <= NOW())
    AND (p_audience IS NULL OR a.audience = p_audience OR a.audience = 'general')
    AND (
      p_query IS NULL
      OR length(btrim(p_query)) = 0
      OR a.search_vector @@ plainto_tsquery('english', p_query)
    )
  ORDER BY
    CASE
      WHEN p_query IS NULL OR length(btrim(p_query)) = 0 THEN 0::real
      ELSE ts_rank(a.search_vector, plainto_tsquery('english', p_query))
    END DESC,
    a.title ASC
  LIMIT greatest(1, least(50, p_limit))
  OFFSET greatest(0, p_offset);
$$;

COMMENT ON FUNCTION public.search_learning_articles_admin IS 'Admin/support full-text search over published learning articles, including internal. Audience-aware. SECURITY DEFINER — call only from trusted admin/service-role contexts.';

REVOKE ALL ON FUNCTION public.search_learning_articles_admin(text, int, int, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_learning_articles_admin(text, int, int, text, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.search_learning_articles_admin(text, int, int, text, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.search_learning_articles_admin(text, int, int, text, boolean) TO service_role;
