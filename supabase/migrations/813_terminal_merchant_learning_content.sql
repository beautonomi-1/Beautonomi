-- ============================================================================
-- 813: Learning Center — Card Machines (replaces stale Yoco terminal content)
-- ============================================================================

UPDATE public.learning_categories
SET title = 'Card Machines',
    slug = 'card-machines',
    sort_order = 25,
    audience = 'provider',
    visibility = 'public',
    updated_at = NOW()
WHERE slug = 'yoco-terminal'
  AND NOT EXISTS (SELECT 1 FROM public.learning_categories c WHERE c.slug = 'card-machines' AND c.tenant_id IS NULL);

INSERT INTO public.learning_categories (title, slug, icon, sort_order, audience, visibility)
SELECT 'Card Machines', 'card-machines', NULL, 25, 'provider', 'public'
WHERE NOT EXISTS (SELECT 1 FROM public.learning_categories WHERE slug = 'card-machines');

INSERT INTO public.learning_articles (category_id, title, slug, summary, body, content_format, status, audience, is_internal, published_at)
SELECT c.id, v.title, v.slug, v.summary, v.body, 'html', 'published', 'provider', false, NOW()
FROM public.learning_categories c
CROSS JOIN (
  VALUES
    (
      'Documents you need before applying',
      'card-machines-before-you-apply',
      'Plain-language checklist of ID, proof of address, and bank letter.',
      '<p>Before we can give you a card machine, you will need:</p><ul><li><strong>Your ID</strong> — green ID book, smart ID card, or passport.</li><li><strong>Proof of address</strong> — utility bill, bank statement, or lease in your name, not older than 3 months.</li><li><strong>Bank confirmation letter</strong> — download from your banking app or request at a branch.</li><li><strong>Company documents</strong> — CIPC certificate if you are a registered company.</li></ul>',
      1
    ),
    (
      'How the card machine application works',
      'card-machines-application-guide',
      'Steps, review times, and your application number.',
      '<p>After you order or allocate a terminal, complete the application in the app. Our team reviews your details, then sends them to our terminal partner. You will receive an application number (e.g. TMO-000123) — quote this when you contact support.</p>',
      2
    ),
    (
      'The term sheet explained',
      'card-machines-term-sheet-explained',
      'Why you receive an SMS OTP from our terminal partner.',
      '<p>After approval of your details, our terminal partner sends a term sheet to your phone via SMS. You accept it on their platform — not inside Beautonomi. This confirms your merchant agreement for card processing.</p>',
      3
    ),
    (
      'Delivery and collection',
      'card-machines-delivery-collection',
      'What to expect when your machine is on its way.',
      '<p>Choose courier delivery to your salon or collection from a hub. Once approved, we dispatch your device and you activate it under Card machines in the app.</p>',
      4
    ),
    (
      'Taking your first payment',
      'card-machines-first-payment',
      'Activate your machine and accept card payments.',
      '<p>Open Card machines, ensure your device is active, then take payment from a booking or walk-in sale. Tips, QR, and cashback are available when enabled on your plan.</p>',
      5
    ),
    (
      'Card machine troubleshooting',
      'card-machines-troubleshooting',
      'Payment stuck, offline terminal, missing term sheet SMS.',
      '<p><strong>Payment stuck?</strong> Use Reconcile in Card machines or contact support with your application number.</p><p><strong>Terminal offline?</strong> Check power and data connection, then restart the device.</p><p><strong>No term sheet SMS?</strong> Confirm the phone number on your application matches the SIM on your phone.</p>',
      6
    ),
    (
      'Card machine FAQ',
      'card-machines-faq',
      'Fees, settlement, approval times, declined applications.',
      '<p><strong>Where does the money go?</strong> Card payments settle to your own bank account — Beautonomi does not hold in-person terminal funds.</p><p><strong>How long does approval take?</strong> Usually a few business days after you submit complete documents.</p><p><strong>Application declined?</strong> Contact support — we will explain next steps including refunds for paid orders where applicable.</p>',
      7
    ),
    (
      'What happens after you submit',
      'card-machines-what-happens-next',
      'Track status from review through dispatch.',
      '<p>Submitted → In review → Term sheet on your phone → Approved → Dispatched or ready for collection. You can track progress in the app and via notifications.</p>',
      8
    )
) AS v(title, slug, summary, body, sort_order)
WHERE c.slug = 'card-machines'
  AND c.tenant_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.learning_articles a WHERE a.slug = v.slug AND a.tenant_id IS NULL);

UPDATE public.learning_articles
SET status = 'archived', updated_at = NOW()
WHERE slug IN (
  'yoco-terminal-overview',
  'yoco-terminal-payment',
  'yoco-setup',
  'yoco-walk-in-payment'
)
  AND tenant_id IS NULL;
