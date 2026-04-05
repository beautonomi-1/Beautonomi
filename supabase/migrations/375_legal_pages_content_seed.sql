-- 375_legal_pages_content_seed.sql
-- Seeds global (tenant_id NULL) CMS content for mandatory public legal pages.
-- Structure informed by common marketplace / booking-platform practice (intermediary model, fees, payments,
-- reviews, safety, disputes)—not copied from any third party. Multi-jurisdiction privacy (GDPR/EEA+UK+CH,
-- POPIA ZA, US state laws incl. CPRA, LGPD, Australia, Canada, Singapore, India DPDPA).
-- Not legal advice: have qualified counsel adapt entity name, governing law, fees, and regional variants.
-- Pages: /privacy-policy, /terms-and-condition, /cookie-policy (requires Next route cookie-policy).

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

  DROP TABLE IF EXISTS _legal_page_content_seed;
  CREATE TEMP TABLE _legal_page_content_seed (
    page_slug text NOT NULL,
    section_key text NOT NULL,
    content_type text NOT NULL,
    content text NOT NULL,
    display_order int NOT NULL
  );

  INSERT INTO _legal_page_content_seed (page_slug, section_key, content_type, content, display_order)
  VALUES
  (
    'privacy-policy',
    'hero_title',
    'text',
    'Beautonomi Privacy Policy',
    0
  ),
  (
    'privacy-policy',
    'hero_description',
    'html',
    $privacy$
<p><strong>Effective date:</strong> This policy describes how Beautonomi (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) collects, uses, discloses, and protects personal information when you use our websites, mobile applications, and related services (together, the &quot;Platform&quot;). By using the Platform, you acknowledge this policy.</p>
<p><strong>Notices by jurisdiction.</strong> Depending on where you live, additional rights and requirements may apply. Sections below summarise common regions; they do not limit any mandatory protections you have under local law.</p>

<h2 id="who-we-are">1. Who we are &amp; roles</h2>
<p>Beautonomi operates an online marketplace connecting customers with independent or business beauty and wellness <strong>providers</strong>. Depending on the activity, we may act as a <strong>controller</strong> of your account and platform usage data, while <strong>providers</strong> are typically controllers of information they collect to deliver services (e.g. notes about your appointment). Payment and messaging processors act as <strong>processors</strong> under our instructions where applicable.</p>

<h2 id="scope-and-jurisdictions">2. Geographic scope</h2>
<p>We aim to comply with applicable privacy laws in the regions where we operate or where users access the Platform, including without limitation:</p>
<ul>
<li><strong>European Economic Area (EEA), United Kingdom, and Switzerland</strong> — GDPR, UK GDPR / Data Protection Act 2018, and Swiss FADP (as applicable).</li>
<li><strong>South Africa</strong> — Protection of Personal Information Act (POPIA).</li>
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
<li><strong>Booking &amp; commerce:</strong> appointments, cart and product orders, addresses, messages in-platform, reviews, support tickets.</li>
<li><strong>Payments:</strong> transaction metadata (we use payment partners; we do not store full card numbers).</li>
<li><strong>Provider &amp; business data:</strong> business profile, services, pricing, staff, verification/KYC documents where required for payouts or compliance.</li>
<li><strong>Device &amp; technical:</strong> IP address, device identifiers, app version, crash logs, coarse location from IP, and—with permission—precise location for features such as travel or nearby search.</li>
<li><strong>Analytics &amp; communications:</strong> product analytics (where consented or permitted), email/SMS/push engagement, attribution identifiers where allowed by your device settings.</li>
<li><strong>Cookies &amp; similar technologies:</strong> as described in our <a href="/cookie-policy">Cookie Policy</a>.</li>
<li><strong>Inferences:</strong> we may derive preferences, fraud risk scores, or segment labels from usage patterns to operate and secure the Platform.</li>
</ul>

<h2 id="sources">4. Where we get personal information</h2>
<p><strong>You</strong> provide information when you register, book, list services, pay, message, or contact support. <strong>Automatic technologies</strong> collect device and usage data when you use the Platform. <strong>Third parties</strong> may provide information where you connect an account (e.g. sign-in with Apple or Google), where payment partners confirm transaction status, or where providers enter details about appointments.</p>

<h2 id="sensitive">5. Sensitive, health-related, or special category information</h2>
<p>Beauty and wellness services may involve information about allergies, skin conditions, or similar topics that providers record to deliver services safely. <strong>Providers</strong> who enter such information are typically responsible as controllers for that treatment data. We process it as needed to operate messaging, bookings, and compliance features. Where GDPR applies, we rely on applicable Article 6 and, where relevant, Article 9 bases (such as explicit consent, substantial public interest, or health care/treatment with professional secrecy as permitted by law). Do not upload unnecessary medical records through the Platform unless a feature explicitly requires it.</p>

<h2 id="how-we-use">6. How we use information &amp; legal bases (EEA/UK/CH)</h2>
<p>We use data to operate, secure, and improve the Platform; process bookings and payments; provide support; prevent fraud and abuse; comply with law; and send service messages. Where GDPR-style laws apply, we rely on:</p>
<ul>
<li><strong>Contract</strong> — providing services you request.</li>
<li><strong>Legitimate interests</strong> — security, analytics, product improvement, and marketplace integrity (balanced against your rights).</li>
<li><strong>Consent</strong> — optional marketing, non-essential cookies, or tracking where required.</li>
<li><strong>Legal obligation</strong> — tax, regulatory, or law enforcement requests subject to due process.</li>
</ul>

<h2 id="sharing">7. How we share information</h2>
<p>We may share data with: providers you book (to fulfil appointments); payment processors; cloud hosting and email/SMS/push vendors; analytics and attribution partners (subject to your device/app choices); professional advisers; and authorities when required by law. We use contracts (including standard contractual clauses where appropriate) to protect international transfers from the EEA/UK/CH.</p>

<h2 id="retention">8. Retention</h2>
<p>We keep information only as long as needed for the purposes above, including legal, tax, and dispute resolution. Inactive accounts may be subject to separate retention or deactivation notices where permitted by law.</p>

<h2 id="security">9. Security</h2>
<p>We implement technical and organisational measures appropriate to the risk (encryption in transit, access controls, monitoring). No method of transmission or storage is 100% secure.</p>

<h2 id="rights-eea-uk">10. Your rights — EEA, UK, Switzerland</h2>
<p>You may have rights to access, rectify, erase, restrict processing, data portability, object to certain processing, and withdraw consent. You may lodge a complaint with your local supervisory authority (e.g. ICO in the UK, a lead authority in the EEA, or FDPIC in Switzerland).</p>

<h2 id="rights-south-africa">11. Your rights — South Africa (POPIA)</h2>
<p>You may request access to, correction of, or deletion of personal information we hold, subject to exceptions. You may object to processing and complain to the <strong>Information Regulator (South Africa)</strong>.</p>

<h2 id="rights-united-states">12. Your rights — United States</h2>
<p><strong>California residents (CPRA):</strong> You may have rights to know categories and specific pieces of personal information collected; delete; correct inaccuracies; opt out of sale or sharing (including certain cross-context behavioural advertising); and limit use of sensitive personal information. We do not discriminate for exercising rights. You may use an authorised agent where the law allows.</p>
<p><strong>&quot;Sale&quot; and &quot;sharing&quot;:</strong> We do not sell personal information for money. We may share data with analytics or advertising partners in ways that some state laws treat as &quot;sharing&quot; for cross-context behavioural advertising; where required we honour opt-out signals and requests.</p>
<p><strong>Financial incentives:</strong> we do not offer programmes that require payment of different prices for collecting personal data beyond ordinary loyalty or referral offers described at enrolment.</p>
<p><strong>Other US states:</strong> Colorado, Virginia, Connecticut, Utah, and others may grant similar access, deletion, correction, and opt-out rights. Submit requests via our <a href="/help">Help</a> centre; we will verify your identity.</p>

<h2 id="rights-brazil">11. Your rights — Brazil (LGPD)</h2>
<p>You may have rights of confirmation, access, correction, anonymisation, portability, deletion, information about sharing, and revocation of consent, plus complaint to the ANPD.</p>

<h2 id="rights-australia">14. Your rights — Australia</h2>
<p>You may access and request correction of personal information. Complaints may be raised with the OAIC if unresolved.</p>

<h2 id="rights-canada">15. Canada &amp; Singapore (brief)</h2>
<p><strong>Canada:</strong> access and challenge accuracy under PIPEDA or provincial equivalents. <strong>Singapore:</strong> access and correction rights under PDPA; you may withdraw consent where processing is consent-based.</p>

<h2 id="rights-india">16. India (DPDPA)</h2>
<p>Where the DPDPA applies, you may have rights to access, correction, erasure, grievance redressal, and nomination, as provided by law and our processes.</p>

<h2 id="business-transfers">17. Business transfers</h2>
<p>If we are involved in a merger, acquisition, or sale of assets, personal information may be transferred as part of that transaction subject to confidentiality and continued protection consistent with this policy.</p>

<h2 id="biometrics">18. Biometric information</h2>
<p>We do not use facial recognition or other biometric verification as a default feature of the Platform. If we launch a feature that processes biometrics, we will provide a separate notice and obtain consent where required.</p>

<h2 id="children">19. Children</h2>
<p>The Platform is not directed to children under the age where parental consent is required in your jurisdiction. We do not knowingly collect personal information from such children without appropriate consent.</p>

<h2 id="automated">20. Automated decisions</h2>
<p>We do not use solely automated decision-making that produces legal or similarly significant effects about you, except where disclosed at the point of use or required by law.</p>

<h2 id="third-party">21. Third-party links &amp; app stores</h2>
<p>Our apps are distributed through Apple App Store and Google Play. Those platforms have their own privacy terms. Links to third-party sites are governed by their policies.</p>

<h2 id="copyright">22. Copyright and intellectual property complaints</h2>
<p>If you believe content on the Platform infringes your copyright or other rights, contact us through <a href="/help">Help &amp; support</a> with enough detail to locate the material and verify your claim. We may remove or disable access to content where appropriate.</p>

<h2 id="changes">23. Changes to this policy</h2>
<p>We may update this policy and will post the revised version with a new effective date. Where required, we will notify you or seek consent.</p>

<h2 id="contact">24. Contact</h2>
<p>For privacy requests or questions, contact us through <a href="/help">Help &amp; support</a>. We will respond within timelines required by applicable law.</p>
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
  {"title":"Sensitive & health-related data (in policy)","link":"/privacy-policy#sensitive"},
  {"title":"EEA, UK & Switzerland — GDPR summary (in policy)","link":"/privacy-policy#rights-eea-uk"},
  {"title":"South Africa — POPIA summary (in policy)","link":"/privacy-policy#rights-south-africa"},
  {"title":"United States — state privacy rights (in policy)","link":"/privacy-policy#rights-united-states"}
]
$json$,
    2
  ),
  (
    'privacy-policy',
    'related_articles',
    'json',
    $json$
[
  {"category":"Help","title":"Help centre","description":"Get answers and contact support.","link":"/help"},
  {"category":"Learn","title":"Account & profile","description":"How account settings and privacy controls work on Beautonomi.","link":"/learn/article/account-profile-overview"},
  {"category":"Learn","title":"Security & privacy overview","description":"Security practices and how to protect your account.","link":"/learn/article/security-privacy-overview"}
]
$json$,
    3
  );

  INSERT INTO _legal_page_content_seed (page_slug, section_key, content_type, content, display_order)
  VALUES
  (
    'terms-and-condition',
    'page_title',
    'text',
    'Terms of Service',
    0
  ),
  (
    'terms-and-condition',
    'hero_title',
    'text',
    'Terms of Service',
    1
  ),
  (
    'terms-and-condition',
    'intro_heading',
    'text',
    'Agreement to terms',
    2
  ),
  (
    'terms-and-condition',
    'intro',
    'html',
    $terms_intro$
<p>These Terms of Service (&quot;Terms&quot;) govern access to and use of the Beautonomi Platform (website, mobile apps, and related services). By creating an account, booking, listing services, or otherwise using the Platform, you agree to these Terms and to our <a href="/privacy-policy">Privacy Policy</a> and <a href="/cookie-policy">Cookie Policy</a>.</p>
<p><strong>Marketplace.</strong> Beautonomi is an online venue that helps customers discover and book beauty and wellness services from independent providers or businesses. Except where a checkout or contract expressly states otherwise, <strong>your service relationship is with the provider</strong>, not Beautonomi. We are not a salon, clinic, or employer of providers.</p>
<p><strong>Multi-jurisdiction.</strong> If you are a consumer, nothing in these Terms limits non-waivable rights under the laws of your country or state of residence—including, for EEA, UK, and Australian consumers, the right to bring claims in the courts where you live where mandatory law allows. Commercial users may be subject to additional agreements.</p>
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
  {"title":"Definitions","content":"<p><strong>Beautonomi</strong> / <strong>we</strong> / <strong>us</strong> — the operator of the Platform. <strong>Platform</strong> — websites, apps, APIs, and related services. <strong>User</strong> — anyone with an account or who uses the Platform. <strong>Customer</strong> — a user who books or purchases through the Platform. <strong>Provider</strong> — a business or professional who lists and delivers services. <strong>Content</strong> — text, images, reviews, logos, and other material submitted to the Platform. <strong>Booking</strong> — a scheduled service or order facilitated through the Platform.</p>"},
  {"title":"Eligibility","content":"<p>You must have legal capacity to contract in your jurisdiction and meet minimum age requirements (typically 18+, or higher where local law requires). Providers must have authority to bind their business and, where applicable, hold professional registrations or licences required for their services.</p>"},
  {"title":"Our role in the marketplace","content":"<p>Beautonomi provides <strong>software and a venue</strong> for Customers and Providers to connect. We are <strong>not</strong> the employer of Providers, <strong>not</strong> a party to the underlying beauty or wellness service (except for payment collection or features expressly described at checkout), and <strong>not</strong> responsible for how Providers perform services. Providers are independent contractors or businesses. Any description of Beautonomi as &quot;agent&quot; applies only to payment or collection features explicitly stated in the product flow or a separate merchant agreement—not to the performance of treatments or retail goods.</p>"},
  {"title":"Platform fees, subscriptions, and charges","content":"<p>Beautonomi may charge <strong>subscription fees, commissions, marketplace fees, payment processing fees, or other charges</strong> as disclosed when you register, upgrade a plan, or complete checkout. Fees may change with reasonable notice where required by law. Taxes may be added as shown at payment.</p>"},
  {"title":"Payments, collection, and settlement","content":"<p>Payments are processed by third-party payment partners. You authorise us and those partners to charge, refund, or settle amounts shown at checkout. Where the Platform collects payment from a Customer on behalf of a Provider, settlement timing and deductions (including fees) follow the rules shown in the provider dashboard or payout documentation. Chargebacks, reversals, or fraud investigations may delay or withhold payouts. We may offset amounts you owe us against amounts payable to you.</p>"},
  {"title":"Taxes","content":"<p>Each party is responsible for determining and remitting taxes that apply to its own income, sales, or services. The Platform may display or collect taxes where required by law or as configured by Providers; tax estimates are not tax advice.</p>"},
  {"title":"Accounts & security","content":"<p>Provide accurate information and keep login credentials secure. Notify us promptly of unauthorised access. We may verify identity, suspend accounts for risk, breach, or legal reasons, and require additional checks for payouts or high-risk activity.</p>"},
  {"title":"Bookings, cancellations & no-shows","content":"<p>Cancellation windows, reschedule rules, deposits, and no-show fees are set by the Provider and/or displayed at booking. Beautonomi may provide tools to enforce those rules (e.g. automated charges). If you dispute a fee, contact the Provider first; we may assist with factual disputes but are not obliged to reverse charges that comply with disclosed policies.</p>"},
  {"title":"Refunds and payment disputes","content":"<p>Refund eligibility depends on Provider policy, product terms at purchase, and applicable law. Payment disputes and chargebacks are handled under card-network rules and our fraud policies; abuse may result in account closure.</p>"},
  {"title":"Customer obligations","content":"<p>Provide accurate contact and health-related information requested for safe service (e.g. allergies) when the Provider asks. Arrive on time, follow venue rules, and treat Providers and staff respectfully. Do not use the Platform for harassment, fraud, or to evade fees.</p>"},
  {"title":"Provider obligations","content":"<p>Deliver services lawfully and professionally; hold licences, registrations, and insurance required in your jurisdiction; maintain accurate listings, pricing, and availability; honour confirmed Bookings except as permitted by your stated policy or law; comply with health, safety, sanitation, and data-protection rules for client information you collect. You are responsible for employees and subcontractors.</p>"},
  {"title":"Products, delivery, and returns","content":"<p>Retail product orders (if offered) are subject to availability, delivery or pickup terms, and return or warranty policies shown at purchase.</p>"},
  {"title":"Reviews, ratings, and moderation","content":"<p>Reviews must reflect genuine experiences. You must not post defamatory, discriminatory, fake, or manipulated reviews, or incentivise undisclosed positive reviews. We may remove or restrict Content that violates law or these Terms, or that we reasonably believe is unreliable or abusive, without obligation to monitor all posts.</p>"},
  {"title":"Search, ranking, and discovery","content":"<p>Search results and recommendations may use algorithms considering relevance, distance, availability, quality signals, and commercial factors (such as promotions). We do not guarantee placement or impressions.</p>"},
  {"title":"Content & intellectual property","content":"<p>You retain ownership of your Content. You grant Beautonomi a worldwide, non-exclusive, royalty-free licence to host, reproduce, display, distribute, adapt (e.g. resize images), and promote your Content on the Platform and in marketing, subject to your account settings and law. You warrant you have rights to grant this licence. Platform software, branding, and databases are owned by Beautonomi or licensors. Unauthorised copying or reverse engineering is prohibited.</p>"},
  {"title":"Feedback","content":"<p>If you submit ideas or feedback, you grant us a perpetual, irrevocable licence to use them without obligation to compensate you, except where law forbids.</p>"},
  {"title":"Prohibited conduct","content":"<p>You may not: violate law; offer illegal services; discriminate unlawfully; infringe intellectual property; upload malware; scrape or data-mine the Platform without consent; bypass fees; create fake listings or bookings; misuse another person&apos;s identity; harass, threaten, or endanger others; or use the Platform for money laundering, sanctions evasion, or unlicensed financial services.</p>"},
  {"title":"Safety, reporting, and emergencies","content":"<p>If you believe you or someone else is in immediate danger, contact local emergency services. Report safety or trust concerns through <a href=\"/help\">Help &amp; support</a>. We may cooperate with law enforcement when legally required.</p>"},
  {"title":"Insurance, licences, and assumption of risk","content":"<p>Beauty and wellness services carry ordinary risks (e.g. skin reactions, slips). Providers should maintain appropriate liability and professional coverage. Beautonomi does not insure service outcomes. Nothing on the Platform is medical advice.</p>"},
  {"title":"Promotions, gift cards & referrals","content":"<p>Programmes may have separate rules shown at enrolment. Gift cards are subject to expiry or non-cash redemption limits as stated at purchase.</p>"},
  {"title":"Communications","content":"<p>We send operational and security messages as needed. Marketing requires consent where required. You agree that we may provide notices electronically (email, app, or in-product).</p>"},
  {"title":"Third-party services","content":"<p>Links or integrations (maps, payments, analytics) are governed by third-party terms. We are not responsible for third-party services.</p>"},
  {"title":"Disclaimer of warranties","content":"<p>To the fullest extent permitted by law, the Platform is provided &quot;as is&quot; and &quot;as available&quot; without warranties of merchantability, fitness for a particular purpose, quiet enjoyment, or non-infringement. We do not warrant specific results, revenue, or uninterrupted access.</p>"},
  {"title":"Limitation of liability","content":"<p>To the maximum extent permitted by law, Beautonomi and its affiliates, directors, and staff are not liable for indirect, incidental, special, consequential, or punitive damages, or loss of profits, data, goodwill, or business. Our aggregate liability for Platform-related claims is limited to the greater of (a) amounts you paid to <strong>Beautonomi</strong> (not amounts paid to Providers for services) for the specific feature giving rise to the claim in the twelve (12) months before the claim, or (b) minimum amounts required by mandatory consumer law. Nothing excludes liability that cannot be excluded by law (including gross negligence or wilful misconduct where applicable).</p>"},
  {"title":"Indemnity","content":"<p>You will defend and hold harmless Beautonomi from claims, damages, and costs (including reasonable legal fees) arising from your Content, your services as a Provider, your breach of these Terms, or your violation of law, except to the extent caused by our gross negligence or wilful misconduct.</p>"},
  {"title":"Disputes between Users","content":"<p>Disputes about service quality, refunds, or conduct should first be addressed between Customer and Provider. Beautonomi may offer informal support or tools but is <strong>not</strong> obliged to mediate and does not guarantee a particular outcome.</p>"},
  {"title":"Governing law & courts","content":"<p>Unless mandatory law says otherwise, these Terms are governed by the laws of the <strong>Republic of South Africa</strong>, without regard to conflict-of-law principles. Courts in South Africa have <strong>non-exclusive</strong> jurisdiction. <strong>Consumers</strong> in the EEA, UK, or Australia may also have the right to bring proceedings in their country of residence. We do not seek to deprive consumers of mandatory protections or court access where prohibited. Any attempt to limit class actions applies only to the extent permitted in your jurisdiction.</p>"},
  {"title":"Force majeure & general","content":"<p>We are not liable for delays or failures due to events beyond reasonable control (including outages of third-party infrastructure). If a provision is invalid, the remainder stays in effect. You may not assign these Terms without our consent; we may assign them in connection with a merger or sale. Failure to enforce a provision is not a waiver. These Terms (and policies linked here) are the entire agreement regarding the Platform. You must comply with applicable export and sanctions laws.</p>"},
  {"title":"Changes","content":"<p>We may modify these Terms. We will post updates and, where required by law, notify you or obtain consent. Continued use may constitute acceptance where permitted.</p>"},
  {"title":"Termination","content":"<p>You may close your account via app or Help. We may suspend or terminate for breach, risk, or legal requirements. Sections that should survive (fees owed, liability limits, indemnity, governing law) continue.</p>"},
  {"title":"Contact","content":"<p>Questions: <a href=\"/help\">Help &amp; support</a>. Intellectual property complaints: use Help with details of the material. Data rights: <a href=\"/privacy-policy\">Privacy Policy</a>.</p>"}
]
$terms_json$,
    4
  ),
  (
    'terms-and-condition',
    'sidebar_heading',
    'text',
    'Questions about these terms?',
    5
  ),
  (
    'terms-and-condition',
    'sidebar_description',
    'text',
    'We are happy to help with questions about bookings, accounts, or these Terms.',
    6
  ),
  (
    'terms-and-condition',
    'supplemental_policies',
    'json',
    $json$
[
  {"title":"Privacy Policy","link":"/privacy-policy"},
  {"title":"Cookie Policy","link":"/cookie-policy"}
]
$json$,
    7
  ),
  (
    'terms-and-condition',
    'related_articles',
    'json',
    $json$
[
  {"category":"Learn","title":"Security & privacy overview","description":"How we handle account security and personal data at a high level.","link":"/learn/article/security-privacy-overview"},
  {"category":"Help","title":"Submit a support ticket","description":"Contact the Beautonomi support team.","link":"/help/submit-ticket"}
]
$json$,
    8
  );

  INSERT INTO _legal_page_content_seed (page_slug, section_key, content_type, content, display_order)
  VALUES
  (
    'cookie-policy',
    'page_title',
    'text',
    'Cookie Policy',
    0
  ),
  (
    'cookie-policy',
    'hero_title',
    'text',
    'Cookie Policy',
    1
  ),
  (
    'cookie-policy',
    'intro_heading',
    'text',
    'How we use cookies',
    2
  ),
  (
    'cookie-policy',
    'intro',
    'html',
    $cookie_intro$
<p>This Cookie Policy explains how Beautonomi uses cookies and similar technologies (including pixels, tags, local storage, software development kit identifiers, and scripts) on our websites and apps. It should be read with our <a href="/privacy-policy">Privacy Policy</a>. We use the word &quot;cookies&quot; to include those technologies.</p>
<p><strong>Consent regions:</strong> In the EEA, UK, and Switzerland, non-essential cookies and similar tracking are used only after you consent (e.g. cookie banner) or where a narrow exemption applies. On mobile apps, Apple&apos;s App Tracking Transparency and Android advertising settings apply in addition to this policy.</p>
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
  {"title":"What cookies are","content":"<p>Cookies are small files stored on your device that help sites and apps remember preferences, keep you signed in, measure performance, and—where allowed—support marketing attribution.</p>"},
  {"title":"Types we use","content":"<p><strong>Strictly necessary:</strong> required for security, login, cart, and core features; these cannot be turned off in our service without breaking functionality. <strong>Functional:</strong> remember choices such as language. <strong>Analytics:</strong> help us understand usage (may use pseudonymous IDs). <strong>Marketing / attribution:</strong> measure campaigns where permitted by law and your settings.</p>"},
  {"title":"First- and third-party cookies","content":"<p>We set our own cookies and allow trusted partners (e.g. analytics, payments, support chat) to set cookies subject to their policies and your choices.</p>"},
  {"title":"Mobile apps","content":"<p>Apps may use device advertising identifiers for attribution where you allow tracking; push tokens for notifications; and crash diagnostics. You can control many of these in device settings.</p>"},
  {"title":"Duration","content":"<p>Session cookies expire when you close the browser; persistent cookies remain for a defined period or until deleted.</p>"},
  {"title":"Managing preferences","content":"<p>Use our cookie banner (web) to accept or reject non-essential categories where offered; adjust browser settings to block or delete cookies; use device settings (iOS / Android) for advertising IDs and tracking. Global Privacy Control (GPC) or similar signals may be honoured where legally required. Blocking some technologies may limit sign-in, checkout, or personalisation.</p>"},
  {"title":"Updates","content":"<p>We may update this Cookie Policy; the new effective date will be posted here.</p>"},
  {"title":"Contact","content":"<p>Questions: <a href=\"/help\">Help &amp; support</a>.</p>"}
]
$cookie_json$,
    4
  ),
  (
    'cookie-policy',
    'sidebar_heading',
    'text',
    'Cookie questions?',
    5
  ),
  (
    'cookie-policy',
    'sidebar_description',
    'text',
    'Reach out through Help if you need more detail about specific cookies or tools we use.',
    6
  );

  IF has_tenant_id THEN
    UPDATE public.page_content pc
    SET
      content_type = s.content_type,
      content = s.content,
      metadata = '{}'::jsonb,
      display_order = s.display_order,
      is_active = true,
      updated_at = now()
    FROM _legal_page_content_seed s
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
    FROM _legal_page_content_seed s
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
      metadata = '{}'::jsonb,
      display_order = s.display_order,
      is_active = true,
      updated_at = now()
    FROM _legal_page_content_seed s
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
    FROM _legal_page_content_seed s
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.page_content pc
      WHERE pc.page_slug = s.page_slug
        AND pc.section_key = s.section_key
    );
  END IF;

  DROP TABLE IF EXISTS _legal_page_content_seed;
END $seed$;

DO $footer$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'footer_links'
      AND column_name = 'tenant_id'
  ) THEN
    INSERT INTO public.footer_links (section, title, href, display_order, is_external, is_active, tenant_id)
    SELECT 'legal', 'Cookie Policy', '/cookie-policy', 4, false, true, NULL::uuid
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.footer_links fl
      WHERE fl.section = 'legal'
        AND fl.href = '/cookie-policy'
        AND fl.tenant_id IS NULL
    );
  ELSE
    INSERT INTO public.footer_links (section, title, href, display_order, is_external, is_active)
    SELECT 'legal', 'Cookie Policy', '/cookie-policy', 4, false, true
    WHERE NOT EXISTS (
      SELECT 1 FROM public.footer_links fl WHERE fl.section = 'legal' AND fl.href = '/cookie-policy'
    );
  END IF;
END $footer$;
