-- 780_legal_pages_content_refresh.sql
-- Refreshes global (tenant_id NULL) CMS content for the public legal pages so they cover the
-- platform end to end as actually built:
--   * Identity verification (third-party partner with ID document, facial match, and liveness
--     checks) — replaces the outdated "no biometrics" statement.
--   * Business (KYB) verification for providers.
--   * Beautonomi card machines / Terminal Shop hardware commerce, in-person payment settlement,
--     and POS integrations (PayCloud, Yoco, Paystack Terminal).
--   * Provider subscriptions with auto-renewal, memberships, gift cards, sponsored placement.
--   * Named processor/vendor categories (payments, hosting, analytics, push, error monitoring,
--     messaging channels including WhatsApp/SMS/email).
--   * Guest & portal bookings, house-call service addresses, marketing attribution, referrals.
--   * Account & data deletion flow (/data-deletion) with retention aligned to that page.
--   * Cookie categories aligned to the in-product consent manager
--     (necessary / functional / analytics / marketing) and the actual tools used.
-- Follows the same upsert pattern as 375_legal_pages_content_seed.sql.
-- Not legal advice: have qualified counsel review entity names, governing law, and regional variants.

DO $seed$
DECLARE
  has_tenant_id boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'page_content'
      AND column_name = 'tenant_id'
  )
  INTO has_tenant_id;

  DROP TABLE IF EXISTS _legal_page_content_refresh;
  CREATE TEMP TABLE _legal_page_content_refresh (
    page_slug text NOT NULL,
    section_key text NOT NULL,
    content_type text NOT NULL,
    content text NOT NULL,
    display_order int NOT NULL
  );

  -- ─────────────────────────────────────────────────────────────────────────────
  -- PRIVACY POLICY
  -- ─────────────────────────────────────────────────────────────────────────────
  INSERT INTO _legal_page_content_refresh (page_slug, section_key, content_type, content, display_order)
  VALUES
  (
    'privacy-policy',
    'hero_description',
    'html',
    $privacy$
<p><strong>Last updated: July 2026.</strong> This policy describes how Beautonomi (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) collects, uses, discloses, and protects personal information when you use our websites, the Beautonomi and Beautonomi Partner mobile applications, and related services (together, the &quot;Platform&quot;). By using the Platform, you acknowledge this policy.</p>
<p><strong>Notices by jurisdiction.</strong> Depending on where you live, additional rights and requirements may apply. Sections below summarise common regions; they do not limit any mandatory protections you have under local law.</p>

<h2 id="who-we-are">1. Who we are &amp; roles</h2>
<p>Beautonomi operates an online marketplace connecting customers with independent or business beauty and wellness <strong>providers</strong>. Depending on the activity, we may act as a <strong>controller</strong> (POPIA: responsible party) of your account and platform usage data, while <strong>providers</strong> are typically controllers of information they collect to deliver services (for example notes about your appointment, client records, or point-of-sale records they keep using our tools — where we host those records we act as a <strong>processor / operator</strong> on the provider&apos;s behalf). Payment, identity verification, hosting, and messaging partners act as processors or independent controllers as described below.</p>

<h2 id="scope-and-jurisdictions">2. Geographic scope</h2>
<p>We aim to comply with applicable privacy laws in the regions where we operate or where users access the Platform, including without limitation:</p>
<ul>
<li><strong>South Africa</strong> — Protection of Personal Information Act (POPIA).</li>
<li><strong>European Economic Area (EEA), United Kingdom, and Switzerland</strong> — GDPR, UK GDPR / Data Protection Act 2018, and Swiss FADP (as applicable).</li>
<li><strong>United States</strong> — Federal and state laws (including California Consumer Privacy Act / California Privacy Rights Act where applicable, and similar state statutes).</li>
<li><strong>Brazil</strong> — Lei Geral de Proteção de Dados (LGPD).</li>
<li><strong>Australia</strong> — Privacy Act 1988 (Cth) and Australian Privacy Principles.</li>
<li><strong>Canada</strong> — Personal Information Protection and Electronic Documents Act (PIPEDA) and provincial laws where they apply.</li>
<li><strong>Singapore</strong> — Personal Data Protection Act (PDPA).</li>
<li><strong>India</strong> — Digital Personal Data Protection Act (DPDPA), where applicable.</li>
</ul>
<p>If local law conflicts with a provision of this policy, <strong>local law prevails</strong> to the extent required.</p>

<h2 id="data-we-collect">3. Personal information we collect</h2>
<p>We may collect:</p>
<ul>
<li><strong>Account &amp; profile:</strong> name, email, phone, password hash, photo, language, marketing preferences, referral codes.</li>
<li><strong>Booking &amp; commerce:</strong> appointments (including group, recurring, and custom-offer bookings), cart and retail product orders, gift card purchases and redemptions, memberships, service addresses for at-home or mobile appointments, in-platform messages, reviews, and support tickets.</li>
<li><strong>Guest &amp; portal bookings:</strong> if you book without an account (for example through a booking link or the guest portal), we process the contact and booking details you provide to deliver and manage that booking.</li>
<li><strong>Payments:</strong> transaction metadata for online payments, in-person card machine payments, and point-of-sale integrations (we use payment partners; we do not store full card numbers). For providers this includes payout, settlement, and reconciliation records.</li>
<li><strong>Identity verification:</strong> where verification is required (for example for safety, payouts, or fraud prevention), our verification partner collects images of your government-issued identity document and a selfie, and performs <strong>facial matching and liveness checks</strong>. We receive the verification outcome, risk signals, and limited extracted identity details (such as name and document validity). See section 6.</li>
<li><strong>Provider &amp; business data:</strong> business profile, services, pricing, staff, availability, cancellation policies, business registration and director details for <strong>business (KYB) verification</strong>, bank details for payouts, and card machine / terminal registration details (such as device serial numbers and merchant identifiers).</li>
<li><strong>Device &amp; technical:</strong> IP address, device identifiers, app version, push notification tokens, crash logs, coarse location from IP, and — with permission — precise location for features such as travel, at-home services, or nearby search.</li>
<li><strong>Analytics &amp; communications:</strong> product analytics (where consented or permitted), email / SMS / WhatsApp / push engagement, and marketing attribution data (such as campaign or referral parameters) where allowed by your settings.</li>
<li><strong>Cookies &amp; similar technologies:</strong> as described in our <a href="/cookie-policy">Cookie Policy</a>. You can change your choices at any time via the <strong>Cookie settings</strong> link in the site footer.</li>
<li><strong>Inferences:</strong> we may derive preferences, fraud risk scores, or segment labels from usage patterns to operate and secure the Platform.</li>
</ul>

<h2 id="sources">4. Where we get personal information</h2>
<p><strong>You</strong> provide information when you register, book, list services, pay, verify your identity, message, or contact support. <strong>Automatic technologies</strong> collect device and usage data when you use the Platform. <strong>Third parties</strong> may provide information where you connect an account (e.g. sign-in with Apple or Google), where payment partners confirm transaction, settlement, or chargeback status, where our identity verification partner returns verification results, or where providers enter details about appointments and clients.</p>

<h2 id="sensitive">5. Sensitive, health-related, or special category information</h2>
<p>Beauty and wellness services may involve information about allergies, skin conditions, or similar topics that providers record to deliver services safely. <strong>Providers</strong> who enter such information are typically responsible as controllers for that treatment data; we host and process it on their behalf to operate messaging, bookings, client records, and compliance features. Where GDPR applies, we rely on applicable Article 6 and, where relevant, Article 9 bases (such as explicit consent or health care/treatment with professional secrecy as permitted by law). Do not upload unnecessary medical records through the Platform unless a feature explicitly requires it.</p>

<h2 id="identity-verification">6. Identity verification &amp; biometric data</h2>
<p>To keep the marketplace safe and meet legal obligations, we may ask customers or providers to complete identity verification through a specialist third-party verification partner. That process can involve:</p>
<ul>
<li>capturing images of a government-issued identity document (front and back);</li>
<li>capturing a selfie or short video and comparing it to the document photo (<strong>facial matching</strong>); and</li>
<li>automated <strong>liveness detection</strong> to confirm a real person is present.</li>
</ul>
<p>This may involve biometric data. Where required by law we obtain your <strong>explicit consent</strong> in the verification flow before processing begins. The verification partner processes document and biometric data under contract with us and retains it in line with its own retention rules; we receive and store the <strong>outcome</strong> (approved / declined / needs review), limited extracted identity details, and risk warnings — not raw biometric templates. Verification records are sanitised of unnecessary personal information before storage. If you decline verification, some features (such as booking, payouts, or higher-risk actions) may be unavailable; contact <a href="/help">support</a> to discuss alternatives where the law provides them.</p>
<p>Providers may additionally be asked to complete <strong>business verification (KYB)</strong>, including business registration documents and director or owner details, as required by payment partners and financial-crime laws.</p>

<h2 id="how-we-use">7. How we use information &amp; legal bases (EEA/UK/CH)</h2>
<p>We use data to operate, secure, and improve the Platform; process bookings, orders, and payments (online and in person); verify identity and business details; provide support; prevent fraud and abuse; enforce booking and cancellation policies; comply with law; and send service messages. Where GDPR-style laws apply, we rely on:</p>
<ul>
<li><strong>Contract</strong> — providing services you request.</li>
<li><strong>Legitimate interests</strong> — security, analytics, product improvement, and marketplace integrity (balanced against your rights).</li>
<li><strong>Consent</strong> — optional marketing, non-essential cookies, biometric identity verification, or tracking where required.</li>
<li><strong>Legal obligation</strong> — tax, financial-crime, regulatory, or law enforcement requests subject to due process.</li>
</ul>

<h2 id="sharing">8. How we share information</h2>
<p>We share personal information with the following categories of recipients (current key partners named for transparency; they may change over time):</p>
<ul>
<li><strong>Providers you book</strong> — your name, contact details, booking details, and (for at-home services) the service address, so they can deliver the appointment.</li>
<li><strong>Payment &amp; acquiring partners</strong> — e.g. <strong>Paystack</strong> for online payments, subscriptions, and payouts; <strong>PayCloud</strong> for Beautonomi in-person card machines; <strong>Yoco</strong> where a provider connects that point-of-sale integration.</li>
<li><strong>Identity verification partner</strong> — to perform document, facial-match, and liveness verification described in section 6.</li>
<li><strong>Hosting &amp; infrastructure</strong> — e.g. <strong>Supabase</strong> (database, authentication, storage) and <strong>Vercel</strong> (web hosting).</li>
<li><strong>Analytics</strong> — e.g. <strong>Amplitude</strong> for product analytics, subject to your cookie/consent choices.</li>
<li><strong>Communications</strong> — e.g. <strong>OneSignal</strong> for push notifications, plus email, SMS, and <strong>WhatsApp Business Platform</strong> providers for booking and account messages you have requested or consented to.</li>
<li><strong>Error &amp; crash monitoring</strong> — e.g. <strong>Sentry</strong>, to diagnose and fix faults.</li>
<li><strong>Delivery &amp; courier partners</strong> — to fulfil retail product or card machine orders you place.</li>
<li><strong>Professional advisers and authorities</strong> — where required by law, subject to due process.</li>
</ul>
<p>We use contracts (including standard contractual clauses where appropriate) to protect international transfers from the EEA/UK/CH, and comparable safeguards for cross-border transfers from South Africa under POPIA.</p>

<h2 id="advertising">9. Advertising, sponsored placement &amp; attribution</h2>
<p>Providers can pay for <strong>sponsored placement</strong> on the Platform; sponsored results are labelled. This placement is first-party: we do not sell your personal information to third-party advertising networks. We may use campaign and referral attribution parameters (such as UTM tags) to measure our own marketing, subject to your cookie choices.</p>

<h2 id="retention">10. Retention</h2>
<p>We keep information only as long as needed for the purposes above, including legal, tax, and dispute resolution. As a guide: booking and transaction records and payment receipts are kept for around <strong>5 years</strong> for financial and tax compliance; fraud or safety records up to <strong>7 years</strong>; support tickets around <strong>3 years</strong>; anonymised analytics indefinitely. Full details, including what is deleted immediately when you close your account, are on our <a href="/data-deletion">Account &amp; Data Deletion</a> page.</p>

<h2 id="security">11. Security</h2>
<p>We implement technical and organisational measures appropriate to the risk (encryption in transit, access controls, audit logging, monitoring). No method of transmission or storage is 100% secure. Where required by law we will notify you and regulators of qualifying data breaches.</p>

<h2 id="choices">12. Your choices &amp; controls</h2>
<ul>
<li><strong>Marketing:</strong> opt out via unsubscribe links, in-app notification preferences, or account settings.</li>
<li><strong>Push notifications:</strong> control in your device settings or in-app preferences.</li>
<li><strong>Cookies &amp; analytics:</strong> use the cookie banner or the <strong>Cookie settings</strong> link in the footer; see the <a href="/cookie-policy">Cookie Policy</a>.</li>
<li><strong>Location:</strong> control precise location in your device settings; some features (travel fees, nearby search) will be limited without it.</li>
<li><strong>Account deletion:</strong> delete your account in-app under <em>Account Settings → Privacy &amp; Sharing → Delete Account</em>, or follow the steps on <a href="/data-deletion">Account &amp; Data Deletion</a>.</li>
</ul>

<h2 id="rights-south-africa">13. Your rights — South Africa (POPIA)</h2>
<p>Beautonomi is the <strong>responsible party</strong> for the processing described in this policy. You may request access to, correction of, or deletion of personal information we hold, and object to processing, subject to exceptions. Direct requests to our Information Officer via <a href="mailto:support@beautonomi.com">support@beautonomi.com</a> or <a href="/help">Help &amp; support</a>. If unresolved, you may complain to the <strong>Information Regulator (South Africa)</strong> (inforeg.org.za).</p>

<h2 id="rights-eea-uk">14. Your rights — EEA, UK, Switzerland</h2>
<p>You may have rights to access, rectify, erase, restrict processing, data portability, object to certain processing, and withdraw consent (including consent to biometric verification). You may lodge a complaint with your local supervisory authority (e.g. ICO in the UK, a lead authority in the EEA, or FDPIC in Switzerland).</p>

<h2 id="rights-united-states">15. Your rights — United States</h2>
<p><strong>California residents (CPRA):</strong> You may have rights to know categories and specific pieces of personal information collected; delete; correct inaccuracies; opt out of sale or sharing (including certain cross-context behavioural advertising); and limit use of sensitive personal information. We do not discriminate for exercising rights. You may use an authorised agent where the law allows.</p>
<p><strong>&quot;Sale&quot; and &quot;sharing&quot;:</strong> We do not sell personal information for money. We may share data with analytics partners in ways that some state laws treat as &quot;sharing&quot;; where required we honour opt-out signals (including Global Privacy Control) and requests.</p>
<p><strong>Other US states:</strong> Colorado, Virginia, Connecticut, Utah, and others may grant similar access, deletion, correction, and opt-out rights. Submit requests via our <a href="/help">Help</a> centre; we will verify your identity.</p>

<h2 id="rights-brazil">16. Your rights — Brazil (LGPD)</h2>
<p>You may have rights of confirmation, access, correction, anonymisation, portability, deletion, information about sharing, and revocation of consent, plus complaint to the ANPD.</p>

<h2 id="rights-australia">17. Your rights — Australia</h2>
<p>You may access and request correction of personal information. Complaints may be raised with the OAIC if unresolved.</p>

<h2 id="rights-canada">18. Canada &amp; Singapore (brief)</h2>
<p><strong>Canada:</strong> access and challenge accuracy under PIPEDA or provincial equivalents. <strong>Singapore:</strong> access and correction rights under PDPA; you may withdraw consent where processing is consent-based.</p>

<h2 id="rights-india">19. India (DPDPA)</h2>
<p>Where the DPDPA applies, you may have rights to access, correction, erasure, grievance redressal, and nomination, as provided by law and our processes.</p>

<h2 id="children">20. Children</h2>
<p>The Platform is not directed to children under the age where parental consent is required in your jurisdiction. We do not knowingly collect personal information from such children without appropriate consent.</p>

<h2 id="automated">21. Automated decisions</h2>
<p>We use automated tools for fraud and risk screening (for example payment risk scores and verification warnings). Decisions that produce legal or similarly significant effects — such as declining verification or closing an account — include human review or an appeal route via <a href="/help">support</a>, except where law permits otherwise.</p>

<h2 id="business-transfers">22. Business transfers</h2>
<p>If we are involved in a merger, acquisition, or sale of assets, personal information may be transferred as part of that transaction subject to confidentiality and continued protection consistent with this policy.</p>

<h2 id="third-party">23. Third-party links &amp; app stores</h2>
<p>Our apps are distributed through Apple App Store and Google Play. Those platforms have their own privacy terms. Links to third-party sites (including payment pages hosted by our payment partners) are governed by their policies.</p>

<h2 id="copyright">24. Copyright and intellectual property complaints</h2>
<p>If you believe content on the Platform infringes your copyright or other rights, contact us through <a href="/help">Help &amp; support</a> with enough detail to locate the material and verify your claim. We may remove or disable access to content where appropriate.</p>

<h2 id="changes">25. Changes to this policy</h2>
<p>We may update this policy and will post the revised version with a new effective date. Where required, we will notify you or seek consent.</p>

<h2 id="contact">26. Contact</h2>
<p>For privacy requests or questions, contact us at <a href="mailto:support@beautonomi.com">support@beautonomi.com</a> or through <a href="/help">Help &amp; support</a>. We will respond within timelines required by applicable law.</p>
$privacy$,
    1
  ),
  (
    'privacy-policy',
    'supplemental_policies',
    'json',
    $json$
[
  {"title":"Terms of Service","link":"/terms-and-condition"},
  {"title":"Cookie Policy","link":"/cookie-policy"},
  {"title":"Account & Data Deletion","link":"/data-deletion"},
  {"title":"Identity verification & biometric data (in policy)","link":"/privacy-policy#identity-verification"},
  {"title":"Sensitive & health-related data (in policy)","link":"/privacy-policy#sensitive"},
  {"title":"South Africa — POPIA summary (in policy)","link":"/privacy-policy#rights-south-africa"},
  {"title":"EEA, UK & Switzerland — GDPR summary (in policy)","link":"/privacy-policy#rights-eea-uk"},
  {"title":"United States — state privacy rights (in policy)","link":"/privacy-policy#rights-united-states"}
]
$json$,
    2
  );

  -- ─────────────────────────────────────────────────────────────────────────────
  -- TERMS OF SERVICE
  -- ─────────────────────────────────────────────────────────────────────────────
  INSERT INTO _legal_page_content_refresh (page_slug, section_key, content_type, content, display_order)
  VALUES
  (
    'terms-and-condition',
    'intro',
    'html',
    $terms_intro$
<p><strong>Last updated: July 2026.</strong> These Terms of Service (&quot;Terms&quot;) govern access to and use of the Beautonomi Platform (websites, the Beautonomi and Beautonomi Partner mobile apps, and related services). By creating an account, booking, listing services, purchasing products or hardware, or otherwise using the Platform, you agree to these Terms and to our <a href="/privacy-policy">Privacy Policy</a> and <a href="/cookie-policy">Cookie Policy</a>.</p>
<p><strong>Marketplace.</strong> Beautonomi is an online venue that helps customers discover and book beauty and wellness services from independent providers or businesses. Except where a checkout or contract expressly states otherwise, <strong>your service relationship is with the provider</strong>, not Beautonomi. We are not a salon, clinic, or employer of providers.</p>
<p><strong>Multi-jurisdiction.</strong> If you are a consumer, nothing in these Terms limits non-waivable rights under the laws of your country or state of residence — including, for South African consumers, rights under the Consumer Protection Act, and for EEA, UK, and Australian consumers, the right to bring claims in the courts where you live where mandatory law allows. Commercial users may be subject to additional agreements.</p>
<p><strong>Apple / Google.</strong> Downloading our mobile apps is also subject to the applicable app store terms. In the event of conflict between those terms and these Terms regarding the app binary, the store terms govern only their relationship with you as to the store.</p>
$terms_intro$,
    3
  ),
  (
    'terms-and-condition',
    'sections',
    'json',
    $terms_json$
[
  {"title":"Definitions","content":"<p><strong>Beautonomi</strong> / <strong>we</strong> / <strong>us</strong> — the operator of the Platform. <strong>Platform</strong> — websites, apps, APIs, and related services. <strong>User</strong> — anyone with an account or who uses the Platform. <strong>Customer</strong> — a user who books or purchases through the Platform. <strong>Provider</strong> — a business or professional who lists and delivers services. <strong>Content</strong> — text, images, reviews, logos, and other material submitted to the Platform. <strong>Booking</strong> — a scheduled service or order facilitated through the Platform, including group, recurring, and custom-offer bookings. <strong>Card Machine</strong> — a physical payment terminal sold, allocated, or supported by Beautonomi. <strong>Subscription</strong> — a recurring paid plan for Providers or Customers.</p>"},
  {"title":"Eligibility","content":"<p>You must have legal capacity to contract in your jurisdiction and meet minimum age requirements (typically 18+, or higher where local law requires). Providers must have authority to bind their business and, where applicable, hold professional registrations or licences required for their services.</p>"},
  {"title":"Our role in the marketplace","content":"<p>Beautonomi provides <strong>software and a venue</strong> for Customers and Providers to connect. We are <strong>not</strong> the employer of Providers, <strong>not</strong> a party to the underlying beauty or wellness service (except for payment collection, hardware sales, or features expressly described at checkout), and <strong>not</strong> responsible for how Providers perform services. Providers are independent contractors or businesses. Any description of Beautonomi as &quot;agent&quot; applies only to payment or collection features explicitly stated in the product flow or a separate merchant agreement — not to the performance of treatments or retail goods.</p>"},
  {"title":"Identity & business verification","content":"<p>We may require Customers or Providers to complete <strong>identity verification</strong> through a third-party verification partner before using certain features (such as booking, payouts, or higher-risk actions). Verification can involve capturing a government-issued identity document and a selfie with facial matching and liveness checks, as described in our <a href=\"/privacy-policy#identity-verification\">Privacy Policy</a>. Providers may additionally be required to complete <strong>business (KYB) verification</strong> — including business registration and director details — as required by payment partners and financial-crime laws. We may suspend or limit accounts that fail, refuse, or manipulate verification.</p>"},
  {"title":"Provider subscriptions & plan billing","content":"<p>Provider plans are billed on a recurring basis at the price and interval shown at checkout and <strong>renew automatically</strong> until cancelled. You can change or cancel your plan in provider settings; changes take effect as described there (typically at the next billing cycle, with upgrades effective immediately). If a renewal payment fails, we may retry, restrict plan features (including card machine acceptance where the plan includes it), or downgrade the account after notice. Fees already paid are non-refundable except where required by law or stated at purchase. Some plans include hardware or usage allowances — see &quot;Card machines &amp; payment hardware&quot;.</p>"},
  {"title":"Platform fees & charges","content":"<p>Beautonomi may charge <strong>subscription fees, commissions, marketplace fees, payment processing fees, advertising fees, hardware prices, or other charges</strong> as disclosed when you register, upgrade a plan, buy placement, or complete checkout. Fees may change with reasonable notice where required by law. Taxes may be added as shown at payment.</p>"},
  {"title":"Payments, collection & settlement","content":"<p>Online payments are processed by third-party payment partners. You authorise us and those partners to charge, refund, or settle amounts shown at checkout. Where the Platform collects payment from a Customer on behalf of a Provider, settlement timing and deductions (including fees) follow the rules shown in the provider dashboard or payout documentation. Chargebacks, reversals, or fraud investigations may delay or withhold payouts. We may offset amounts you owe us against amounts payable to you.</p>"},
  {"title":"In-person payments & card machines","content":"<p>Providers may accept in-person payments using <strong>Beautonomi card machines</strong> or supported point-of-sale integrations. In-person card machine payments settle to the Provider&apos;s merchant account under the applicable acquiring or merchant agreement — <strong>they are not part of Beautonomi online payouts</strong>. Refunds of in-person charges are performed on the physical device and then recorded on the Platform. Providers are responsible for keeping devices secure, following card-scheme rules, and only charging amounts agreed with the Customer. We may suspend terminal acceptance for suspected fraud, chargebacks, or breach.</p>"},
  {"title":"Card machines & payment hardware (Terminal Shop)","content":"<p>Providers may order card machines from the Beautonomi catalog by once-off purchase or as hardware <strong>included with an eligible subscription plan</strong>. Prices, delivery or collection options, and any activation steps are shown at checkout. Hardware orders may require payment before dispatch; digital-activation products are provisioned electronically. Ownership of purchased hardware passes on payment in full; <strong>plan-included hardware may remain platform-owned</strong> as stated at allocation and may need to be returned if your plan ends. Devices must be activated with their serial number and used with the required merchant setup. Hardware is covered by manufacturer warranty and any statutory rights (including, for South African consumers, Consumer Protection Act warranties); report faults via <a href=\"/help\">support</a>. Returns of non-defective hardware follow the returns terms shown at purchase.</p>"},
  {"title":"Third-party POS integrations","content":"<p>Where a Provider connects a third-party point-of-sale or payment integration (for example Yoco or a payment partner terminal), that integration is governed by the third party&apos;s own merchant terms. Beautonomi records transaction outcomes for reporting but is not the acquirer and does not control third-party fees or settlement.</p>"},
  {"title":"Taxes","content":"<p>Each party is responsible for determining and remitting taxes that apply to its own income, sales, or services. The Platform may display or collect taxes where required by law or as configured by Providers; tax estimates are not tax advice.</p>"},
  {"title":"Accounts & security","content":"<p>Provide accurate information and keep login credentials secure. Notify us promptly of unauthorised access. We may verify identity, suspend accounts for risk, breach, or legal reasons, and require additional checks (such as one-time codes) for sensitive actions, payouts, or high-risk activity.</p>"},
  {"title":"Bookings, cancellations & no-shows","content":"<p>Cancellation windows, reschedule rules, deposits, and no-show fees are set by the Provider and/or displayed at booking, and apply equally to group, recurring, custom-offer, and guest/portal bookings. Beautonomi provides tools to enforce those rules, including <strong>automated charges of disclosed deposits, cancellation fees, or no-show fees</strong> to the payment method on file. Unpaid pending bookings may expire automatically. If you dispute a fee, contact the Provider first; we may assist with factual disputes but are not obliged to reverse charges that comply with disclosed policies.</p>"},
  {"title":"Guest & portal bookings","content":"<p>Customers may book or manage bookings without an account through booking links or the guest portal. These Terms apply to such bookings; the booking confirmation and portal link are your access credentials — keep them private.</p>"},
  {"title":"Refunds and payment disputes","content":"<p>Refund eligibility depends on Provider policy, product terms at purchase, and applicable law. Payment disputes and chargebacks are handled under card-network rules and our fraud policies; abuse may result in account closure.</p>"},
  {"title":"Customer obligations","content":"<p>Provide accurate contact and health-related information requested for safe service (e.g. allergies) when the Provider asks. For at-home services, provide a safe, accurate service address. Arrive on time, follow venue rules, and treat Providers and staff respectfully. Do not use the Platform for harassment, fraud, or to evade fees.</p>"},
  {"title":"Provider obligations","content":"<p>Deliver services lawfully and professionally; hold licences, registrations, and insurance required in your jurisdiction; maintain accurate listings, pricing, and availability; honour confirmed Bookings except as permitted by your stated policy or law; comply with health, safety, sanitation, and data-protection rules for client information you collect (you are the responsible party / controller for your client records). You are responsible for employees and subcontractors.</p>"},
  {"title":"Products, delivery, and returns","content":"<p>Retail product orders and hardware orders are subject to availability, delivery or pickup terms, and return or warranty policies shown at purchase. Delivery timelines are estimates; risk passes as stated at checkout or on delivery where consumer law requires.</p>"},
  {"title":"Gift cards & memberships","content":"<p>Gift cards are redeemable as described at purchase, are not redeemable for cash except where law requires, and expire only as permitted by applicable consumer law. Customer memberships bill on a recurring basis, <strong>renew automatically</strong> until cancelled in account settings, and unused benefits are governed by the membership terms shown at sign-up.</p>"},
  {"title":"Promotions, referrals & advocacy","content":"<p>Promotions, referral rewards, and advocate programmes have separate rules shown at enrolment, may be time-limited, and may be withdrawn for abuse (including self-referral or fake accounts).</p>"},
  {"title":"Reviews, ratings, and moderation","content":"<p>Reviews must reflect genuine experiences. You must not post defamatory, discriminatory, fake, or manipulated reviews, or incentivise undisclosed positive reviews. We may remove or restrict Content that violates law or these Terms, or that we reasonably believe is unreliable or abusive, without obligation to monitor all posts.</p>"},
  {"title":"Search, ranking, sponsored placement & discovery","content":"<p>Search results and recommendations may use algorithms considering relevance, distance, availability, quality signals, and commercial factors. Providers may purchase <strong>sponsored placement</strong>; sponsored results are labelled. We do not guarantee placement, impressions, or bookings from advertising, and prepaid advertising budgets are consumed as disclosed at purchase.</p>"},
  {"title":"Content & intellectual property","content":"<p>You retain ownership of your Content. You grant Beautonomi a worldwide, non-exclusive, royalty-free licence to host, reproduce, display, distribute, adapt (e.g. resize images), and promote your Content on the Platform and in marketing, subject to your account settings and law. You warrant you have rights to grant this licence. Platform software, branding, and databases are owned by Beautonomi or licensors. Unauthorised copying or reverse engineering is prohibited.</p>"},
  {"title":"Feedback","content":"<p>If you submit ideas or feedback, you grant us a perpetual, irrevocable licence to use them without obligation to compensate you, except where law forbids.</p>"},
  {"title":"Prohibited conduct","content":"<p>You may not: violate law; offer illegal services; discriminate unlawfully; infringe intellectual property; upload malware; scrape or data-mine the Platform without consent; bypass fees or take Platform-originated bookings off-platform to evade fees; create fake listings, bookings, or reviews; misuse another person&apos;s identity or verification documents; harass, threaten, or endanger others; tamper with card machines; or use the Platform for money laundering, sanctions evasion, or unlicensed financial services.</p>"},
  {"title":"Safety, reporting, and emergencies","content":"<p>If you believe you or someone else is in immediate danger, contact local emergency services. Report safety or trust concerns through <a href=\"/help\">Help &amp; support</a>. We may cooperate with law enforcement when legally required.</p>"},
  {"title":"Insurance, protection programmes & assumption of risk","content":"<p>Beauty and wellness services carry ordinary risks (e.g. skin reactions, slips). Providers should maintain appropriate liability and professional coverage. Any Beautonomi protection or cover programme for partners has its own terms shown at enrolment and does not replace Provider insurance. Beautonomi does not insure service outcomes. Nothing on the Platform is medical advice.</p>"},
  {"title":"Communications","content":"<p>We send operational and security messages by email, SMS, WhatsApp, push notification, or in-product notice as needed to run your account and bookings. Marketing requires consent where required and can be switched off in preferences. You agree that we may provide legal notices electronically.</p>"},
  {"title":"Third-party services","content":"<p>Links or integrations (maps, payments, analytics, verification) are governed by third-party terms. We are not responsible for third-party services.</p>"},
  {"title":"Disclaimer of warranties","content":"<p>To the fullest extent permitted by law, the Platform is provided &quot;as is&quot; and &quot;as available&quot; without warranties of merchantability, fitness for a particular purpose, quiet enjoyment, or non-infringement. We do not warrant specific results, revenue, or uninterrupted access. Statutory warranties on goods (including hardware) are not affected.</p>"},
  {"title":"Limitation of liability","content":"<p>To the maximum extent permitted by law, Beautonomi and its affiliates, directors, and staff are not liable for indirect, incidental, special, consequential, or punitive damages, or loss of profits, data, goodwill, or business. Our aggregate liability for Platform-related claims is limited to the greater of (a) amounts you paid to <strong>Beautonomi</strong> (not amounts paid to Providers for services) for the specific feature giving rise to the claim in the twelve (12) months before the claim, or (b) minimum amounts required by mandatory consumer law. Nothing excludes liability that cannot be excluded by law (including gross negligence or wilful misconduct where applicable).</p>"},
  {"title":"Indemnity","content":"<p>You will defend and hold harmless Beautonomi from claims, damages, and costs (including reasonable legal fees) arising from your Content, your services as a Provider, your breach of these Terms, or your violation of law, except to the extent caused by our gross negligence or wilful misconduct.</p>"},
  {"title":"Disputes between Users","content":"<p>Disputes about service quality, refunds, or conduct should first be addressed between Customer and Provider. Beautonomi may offer informal support or tools but is <strong>not</strong> obliged to mediate and does not guarantee a particular outcome.</p>"},
  {"title":"Governing law & courts","content":"<p>Unless mandatory law says otherwise, these Terms are governed by the laws of the <strong>Republic of South Africa</strong>, without regard to conflict-of-law principles. Courts in South Africa have <strong>non-exclusive</strong> jurisdiction. <strong>Consumers</strong> in the EEA, UK, or Australia may also have the right to bring proceedings in their country of residence. We do not seek to deprive consumers of mandatory protections or court access where prohibited. Any attempt to limit class actions applies only to the extent permitted in your jurisdiction.</p>"},
  {"title":"Force majeure & general","content":"<p>We are not liable for delays or failures due to events beyond reasonable control (including outages of third-party infrastructure). If a provision is invalid, the remainder stays in effect. You may not assign these Terms without our consent; we may assign them in connection with a merger or sale. Failure to enforce a provision is not a waiver. These Terms (and policies linked here) are the entire agreement regarding the Platform. You must comply with applicable export and sanctions laws.</p>"},
  {"title":"Changes","content":"<p>We may modify these Terms. We will post updates and, where required by law, notify you or obtain consent. Continued use may constitute acceptance where permitted.</p>"},
  {"title":"Termination","content":"<p>You may close your account in-app under Account Settings → Privacy &amp; Sharing, or via <a href=\"/data-deletion\">Account &amp; Data Deletion</a>. We may suspend or terminate for breach, risk, or legal requirements. Sections that should survive (fees owed, liability limits, indemnity, governing law) continue. Plan-included hardware return obligations survive plan termination.</p>"},
  {"title":"Contact","content":"<p>Questions: <a href=\"/help\">Help &amp; support</a> or <a href=\"mailto:support@beautonomi.com\">support@beautonomi.com</a>. Intellectual property complaints: use Help with details of the material. Data rights: <a href=\"/privacy-policy\">Privacy Policy</a>.</p>"}
]
$terms_json$,
    4
  ),
  (
    'terms-and-condition',
    'supplemental_policies',
    'json',
    $json$
[
  {"title":"Privacy Policy","link":"/privacy-policy"},
  {"title":"Cookie Policy","link":"/cookie-policy"},
  {"title":"Account & Data Deletion","link":"/data-deletion"}
]
$json$,
    7
  );

  -- ─────────────────────────────────────────────────────────────────────────────
  -- COOKIE POLICY
  -- ─────────────────────────────────────────────────────────────────────────────
  INSERT INTO _legal_page_content_refresh (page_slug, section_key, content_type, content, display_order)
  VALUES
  (
    'cookie-policy',
    'intro',
    'html',
    $cookie_intro$
<p><strong>Last updated: July 2026.</strong> This Cookie Policy explains how Beautonomi uses cookies and similar technologies (including pixels, tags, local storage, software development kit identifiers, and scripts) on our websites and apps. It should be read with our <a href="/privacy-policy">Privacy Policy</a>. We use the word &quot;cookies&quot; to include those technologies.</p>
<p><strong>Your choices:</strong> our cookie banner lets you accept or reject non-essential categories, and you can change your choices at any time via the <strong>Cookie settings</strong> link in the site footer. In the EEA, UK, and Switzerland, non-essential cookies are used only after you consent or where a narrow exemption applies. On mobile apps, Apple&apos;s App Tracking Transparency and Android advertising settings apply in addition to this policy.</p>
<p><strong>Legitimate interest:</strong> where local law allows, we may rely on legitimate interest for strictly limited analytics or security cookies without consent, balanced against your rights.</p>
$cookie_intro$,
    3
  ),
  (
    'cookie-policy',
    'sections',
    'json',
    $cookie_json$
[
  {"title":"What cookies are","content":"<p>Cookies are small files stored on your device that help sites and apps remember preferences, keep you signed in, measure performance, and — where allowed — support marketing attribution.</p>"},
  {"title":"Categories we use","content":"<p>Our consent manager groups cookies into four categories, matching the choices in the banner and Cookie settings:</p><p><strong>Strictly necessary</strong> — required for security, sign-in and session management, checkout and cart, fraud prevention, and remembering your cookie choices. These cannot be turned off without breaking core functionality.</p><p><strong>Functional</strong> — remember choices such as language, market or currency, and interface preferences.</p><p><strong>Analytics</strong> — help us understand how the Platform is used so we can improve it. Analytics runs only if you allow this category (or where permitted by law).</p><p><strong>Marketing / attribution</strong> — measure our own campaigns and referral links (for example UTM parameters). We do not run third-party advertising networks on the Platform.</p>"},
  {"title":"Tools we currently use","content":"<p>The main technologies behind those categories today are:</p><p><strong>Supabase</strong> — authentication and session cookies (strictly necessary). <strong>Paystack</strong> — payment and fraud-prevention technologies during checkout (strictly necessary). <strong>Amplitude</strong> — product analytics (analytics category). <strong>OneSignal</strong> — web push subscription and notification delivery (functional; push requires your browser permission). <strong>Sentry</strong> — error and crash reporting to diagnose faults (strictly limited diagnostic use). <strong>Beautonomi first-party storage</strong> — cookie-consent record, session tracking, and marketing attribution parameters. Partners may change over time; this list is kept representative rather than exhaustive.</p>"},
  {"title":"First- and third-party cookies","content":"<p>We set our own cookies and allow the trusted partners above to set cookies subject to their policies and your choices.</p>"},
  {"title":"Mobile apps","content":"<p>Our apps use push notification tokens (via OneSignal) to deliver notifications you have enabled, crash and error diagnostics (via Sentry), and product analytics subject to your settings. Where a feature uses device advertising identifiers, your device-level tracking settings (App Tracking Transparency on iOS, advertising settings on Android) apply. You can control notifications and tracking in device settings.</p>"},
  {"title":"Duration","content":"<p>Session cookies expire when you close the browser; persistent cookies remain for a defined period or until deleted. Your cookie-consent choice is stored with a policy version so we can re-ask when this policy materially changes.</p>"},
  {"title":"Managing preferences","content":"<p>Use the cookie banner or the <strong>Cookie settings</strong> link in the footer to accept or reject non-essential categories at any time; adjust browser settings to block or delete cookies; use device settings (iOS / Android) for advertising IDs and tracking. Global Privacy Control (GPC) or similar signals are honoured where legally required. Blocking some technologies may limit sign-in, checkout, or personalisation.</p>"},
  {"title":"Updates","content":"<p>We may update this Cookie Policy; the new effective date will be posted here and, where the change is material, the banner will ask for your choices again.</p>"},
  {"title":"Contact","content":"<p>Questions: <a href=\"/help\">Help &amp; support</a> or <a href=\"mailto:support@beautonomi.com\">support@beautonomi.com</a>.</p>"}
]
$cookie_json$,
    4
  );

  IF has_tenant_id THEN
    UPDATE public.page_content pc
    SET
      content_type = s.content_type,
      content = s.content,
      display_order = s.display_order,
      is_active = true,
      updated_at = now()
    FROM _legal_page_content_refresh s
    WHERE pc.page_slug = s.page_slug
      AND pc.section_key = s.section_key
      AND pc.tenant_id IS NULL;

    INSERT INTO public.page_content (
      page_slug,
      section_key,
      content_type,
      content,
      metadata,
      display_order,
      is_active,
      tenant_id
    )
    SELECT
      s.page_slug,
      s.section_key,
      s.content_type,
      s.content,
      '{}'::jsonb,
      s.display_order,
      true,
      NULL::uuid
    FROM _legal_page_content_refresh s
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.page_content pc
      WHERE pc.page_slug = s.page_slug
        AND pc.section_key = s.section_key
        AND pc.tenant_id IS NULL
    );
  ELSE
    UPDATE public.page_content pc
    SET
      content_type = s.content_type,
      content = s.content,
      display_order = s.display_order,
      is_active = true,
      updated_at = now()
    FROM _legal_page_content_refresh s
    WHERE pc.page_slug = s.page_slug
      AND pc.section_key = s.section_key;

    INSERT INTO public.page_content (
      page_slug,
      section_key,
      content_type,
      content,
      metadata,
      display_order,
      is_active
    )
    SELECT
      s.page_slug,
      s.section_key,
      s.content_type,
      s.content,
      '{}'::jsonb,
      s.display_order,
      true
    FROM _legal_page_content_refresh s
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.page_content pc
      WHERE pc.page_slug = s.page_slug
        AND pc.section_key = s.section_key
    );
  END IF;

  DROP TABLE IF EXISTS _legal_page_content_refresh;
END $seed$;
